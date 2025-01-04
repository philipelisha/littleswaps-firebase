import { logger } from 'firebase-functions'
import {
  addCardToPaymentIntent,
  confirmPaymentIntent,
  createLabel,
  createStripeAccount,
  createLoginLink,
  createShipment,
  getEstimatedTaxes,
  getLinkedAccounts,
  getStripeBalance,
  validateAddress,
  saveShippingLabel,
  orderTrackingUpdate
} from './index'
import axios from 'axios';
import { orderActions } from '../../order.config';
import { onUpdateOrderStatus } from '../orders/onUpdateOrderStatus';

const stripeMock = {
  paymentMethods: {
    create: jest.fn().mockResolvedValue({}),
    attach: jest.fn().mockResolvedValue({}),
  },
  paymentIntents: {
    update: jest.fn().mockResolvedValue({}),
    confirm: jest.fn().mockResolvedValue({ status: "succeeded" }),
  },
}

const mockUpdate = jest.fn();
jest.mock('../../adminConfig.js', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        update: mockUpdate,
      })),
    })),
  })),
}));

jest.mock("firebase-functions", () => {
  const actualFunctions = jest.requireActual("firebase-functions");

  class MockHttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  return {
    ...actualFunctions,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    https: {
      onCall: jest.fn(),
      HttpsError: MockHttpsError,
    },
  };
});

jest.mock('axios');
jest.mock('../orders/onUpdateOrderStatus');

beforeEach(() => {
  jest.clearAllMocks()
  jest.resetModules()
})

describe("addCardToPaymentIntent", () => {
  it("should add card to payment intent successfully", async () => {
    const data = {
      paymentIntentId: 'someId',
      cardToken: 'someToken',
      customerId: 'someCustomerId',
    }
    const context = { auth: { uid: 'someUserId' } }

    const result = await addCardToPaymentIntent(data, context, stripeMock)

    expect(result.success).toBe(true)
    expect(result.message).toBe("Card added to payment intent successfully.")
  })

  it("should handle error during payment method creation", async () => {
    const errorMessage = "Payment method creation error"
    stripeMock.paymentMethods.create.mockRejectedValueOnce(
      new Error(errorMessage),
    );

    const data = {
      paymentIntentId: 'someId',
      cardToken: 'someToken',
      customerId: 'someCustomerId',
    }
    const context = { auth: { uid: 'someUserId' } }
    const response = await addCardToPaymentIntent(data, context, stripeMock);
    expect(response).toStrictEqual({
      message: "Payment method creation error",
      status: "failed",
      success: false
    })
  })

  it("should handle error during payment method attachment", async () => {
    const errorMessage = "Payment method attachment error"
    stripeMock.paymentMethods.attach.mockRejectedValueOnce(
      new Error(errorMessage),
    )

    const data = {
      paymentIntentId: 'someId',
      cardToken: 'someToken',
      customerId: 'someCustomerId',
    }
    const context = { auth: { uid: 'someUserId' } }
    const response = await addCardToPaymentIntent(data, context, stripeMock);
    expect(response).toStrictEqual({
      message: "Payment method attachment error",
      status: "failed",
      success: false
    })
  })

  it("should handle unauthenticated user", async () => {
    const data = {
      paymentIntentId: 'someId',
      cardToken: 'someToken',
      customerId: 'someCustomerId',
    }
    const context = { auth: null }
    const response = await addCardToPaymentIntent(data, context, stripeMock);
    expect(response).toStrictEqual({
      message: "Authentication required.",
      status: "failed",
      success: false
    })
  })
})

describe("confirmPaymentIntent", () => {
  it("should confirm payment intent successfully", async () => {
    const data = { paymentIntentId: 'someId' }
    const context = { auth: { uid: 'someUserId' } }

    const result = await confirmPaymentIntent(data, context, stripeMock)

    expect(result.success).toBe(true)
    expect(result.message).toBe("Payment confirmed successfully.")
  })

  it("should handle additional authentication required", async () => {
    const stripe = require("stripe")()
    stripeMock.paymentIntents.confirm.mockResolvedValueOnce({
      status: 'requires_action',
    })

    const data = { paymentIntentId: 'someId' }
    const context = { auth: { uid: 'someUserId' } }

    const result = await confirmPaymentIntent(data, context, stripeMock)

    expect(result.success).toBe(false)
    expect(result.message).toBe("Additional authentication required.")
    expect(result.requiresAction).toBe(true)
  })

  it("should handle error during payment confirmation", async () => {
    const stripe = require("stripe")()
    const errorMessage = "Payment confirmation error"
    stripeMock.paymentIntents.confirm.mockRejectedValueOnce(
      new Error(errorMessage),
    )
    const data = { paymentIntentId: 'someId' }
    const context = { auth: { uid: 'someUserId' } }

    const response = await confirmPaymentIntent(data, context, stripeMock);
    expect(response).toStrictEqual({
      message: "Payment confirmation error",
      status: "failed",
      success: false
    })
  })

  it("should handle unexpected payment confirmation status", async () => {
    const stripe = require("stripe")()
    const unexpectedStatus = "unexpected_status"
    stripeMock.paymentIntents.confirm.mockResolvedValueOnce({
      status: unexpectedStatus,
    })

    const data = { paymentIntentId: 'someId' }
    const context = { auth: { uid: 'someUserId' } }

    const result = await confirmPaymentIntent(data, context, stripeMock)

    expect(result.success).toBe(false)
    expect(result.message).toBe("Payment confirmation failed.")
    expect(result.status).toBe(unexpectedStatus)
  })

  it("should handle unauthenticated user", async () => {
    const data = { paymentIntentId: 'someId' }
    const context = { auth: null }

    const response = await confirmPaymentIntent(data, context, stripeMock);

    await expect(response).toStrictEqual({
      message: "Authentication required.",
      status: "failed",
      success: false
    })
  })
})

describe("createStripeAccount", () => {
  let stripeMock;
  beforeEach(() => {
    stripeMock = {
      accounts: {
        create: jest.fn(),
      },
      accountLinks: {
        create: jest.fn(),
      },
    };
  });

  it("should create a Stripe account successfully", async () => {
    const data = { email: 'test@example.com', user: 'someUserId' };
    const context = { auth: { uid: 'someUserId' } };

    stripeMock.accounts.create.mockResolvedValueOnce({ id: 'acct_123' });
    stripeMock.accountLinks.create.mockResolvedValueOnce({ url: 'https://stripe.com/onboarding' });

    const result = await createStripeAccount(data, context, stripeMock);

    expect(result).toBe('https://stripe.com/onboarding');
    expect(stripeMock.accounts.create).toHaveBeenCalledWith({
      type: 'express',
      country: 'US',
      email: 'test@example.com',
    });
    expect(stripeMock.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_123',
      refresh_url: expect.stringContaining('reauth=true&accountId=acct_123'),
      return_url: expect.stringContaining('user-balance'),
      type: 'account_onboarding',
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      stripeAccountId: 'acct_123',
      stripeAccountLink: 'https://stripe.com/onboarding',
    });
  });

  it("should handle unauthenticated user", async () => {
    const data = { email: 'test@example.com', user: 'someUserId' };
    const context = { auth: null };

    await expect(createStripeAccount(data, context, stripeMock)).rejects.toThrow()

    expect(stripeMock.accounts.create).not.toHaveBeenCalled();
  });

  it("should handle error during account creation", async () => {
    const data = { email: 'test@example.com', user: 'someUserId' };
    const context = { auth: { uid: 'someUserId' } };
    jest.spyOn(console, 'error').mockImplementation(() => { });
    const errorMessage = 'Stripe account creation failed';
    stripeMock.accounts.create.mockRejectedValueOnce(new Error(errorMessage));

    const result = await createStripeAccount(data, context, stripeMock);

    expect(result).toBe(false);
    expect(stripeMock.accounts.create).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Error creating Stripe account:',
      expect.any(Error)
    );
  });
});

describe("getStripeBalance", () => {
  let stripeMock;

  beforeEach(() => {
    stripeMock = {
      balance: {
        retrieve: jest.fn(),
      },
    };
  });

  it("should retrieve Stripe balance successfully", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: { uid: 'someUserId' } };

    const balanceResponse = { available: [{ amount: 1000, currency: 'usd' }] };
    stripeMock.balance.retrieve.mockResolvedValueOnce(balanceResponse);

    const result = await getStripeBalance(data, context, stripeMock);

    expect(result).toBe(balanceResponse);
    expect(stripeMock.balance.retrieve).toHaveBeenCalledWith({
      stripeAccount: 'acct_123',
    });
  });

  it("should handle unauthenticated user", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: null };

    await expect(getStripeBalance(data, context, stripeMock)).rejects.toThrow(
      'Authentication required.'
    );
    expect(stripeMock.balance.retrieve).not.toHaveBeenCalled();
  });

  it("should handle error", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: { uid: 'someUserId' } };
    jest.spyOn(logger, 'error').mockImplementation(() => { })
    const errorMessage = new Error('Failed to retrieve balance');
    stripeMock.balance.retrieve.mockRejectedValueOnce(errorMessage);

    const result = await getStripeBalance(data, context, stripeMock);

    expect(result).toBe(false);
    expect(stripeMock.balance.retrieve).toHaveBeenCalledWith({
      stripeAccount: 'acct_123',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Error getting Stripe balance:', errorMessage.message
    );
  });
});

describe("getLinkedAccounts", () => {
  let stripeMock;

  beforeEach(() => {
    stripeMock = {
      accounts: {
        listExternalAccounts: jest.fn(),
      },
    };
  });

  it("should retrieve Stripe linked accounts successfully", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: { uid: 'someUserId' } };

    const externalAccounts = { data: [] };
    stripeMock.accounts.listExternalAccounts.mockResolvedValueOnce(externalAccounts);

    const result = await getLinkedAccounts(data, context, stripeMock);

    expect(result).toBe(externalAccounts.data);
    expect(stripeMock.accounts.listExternalAccounts).toHaveBeenCalledWith('acct_123', {});
  });

  it("should handle unauthenticated user", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: null };

    await expect(getLinkedAccounts(data, context, stripeMock)).rejects.toThrow(
      'You must be authenticated to call this function.'
    );
    expect(stripeMock.accounts.listExternalAccounts).not.toHaveBeenCalled();
  });

  it("should handle error", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: { uid: 'someUserId' } };
    jest.spyOn(logger, 'error').mockImplementation(() => { })
    const errorMessage = new Error('Failed to retrieve balance');
    stripeMock.accounts.listExternalAccounts.mockRejectedValue(errorMessage)

    const result = await getLinkedAccounts(data, context, stripeMock);

    expect(result).toBe(false);
    expect(stripeMock.accounts.listExternalAccounts).toHaveBeenCalledWith('acct_123', {});
    expect(logger.error).toHaveBeenCalledWith(
      'Error getting Stripe linked accounts:', errorMessage.message
    );
  });
});

describe("createLoginLink", () => {
  let stripeMock;

  beforeEach(() => {
    stripeMock = {
      accounts: {
        createLoginLink: jest.fn(),
      },
    };
  });

  it("should retrieve Stripe login link successfully", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: { uid: 'someUserId' } };

    const loginLink = { url: 'login url' };
    stripeMock.accounts.createLoginLink.mockResolvedValueOnce(loginLink);

    const result = await createLoginLink(data, context, stripeMock);

    expect(result).toBe(loginLink.url);
    expect(stripeMock.accounts.createLoginLink).toHaveBeenCalledWith('acct_123');
  });

  it("should handle unauthenticated user", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: null };

    await expect(createLoginLink(data, context, stripeMock)).rejects.toThrow(
      'You must be authenticated to call this function.'
    );
    expect(stripeMock.accounts.createLoginLink).not.toHaveBeenCalled();
  });

  it("should handle error", async () => {
    const data = { accountId: 'acct_123' };
    const context = { auth: { uid: 'someUserId' } };
    jest.spyOn(logger, 'error').mockImplementation(() => { })
    const errorMessage = new Error('Failed to retrieve balance');
    stripeMock.accounts.createLoginLink.mockRejectedValue(errorMessage)

    const result = await createLoginLink(data, context, stripeMock);

    expect(result).toBe(false);
    expect(stripeMock.accounts.createLoginLink).toHaveBeenCalledWith('acct_123');
    expect(logger.error).toHaveBeenCalledWith(
      'Error creating Stripe login link:', errorMessage.message
    );
  });
});

describe("getEstimatedTaxes", () => {
  let stripeMock;

  beforeEach(() => {
    stripeMock = {
      tax: {
        calculations: {
          create: jest.fn()
        }
      },
    };
  });

  it("should retrieve Stripe tax successfully", async () => {
    const data = {
      shippingRateInCents: 4219,
      itemPriceInCents: 83712,
      taxableAddress: {
        street: '123 main st',
        city: 'city',
        state: 'state',
        zip: 'zip',
        country: 'country'
      },
    };
    const context = { auth: { uid: 'someUserId' } };

    const taxInfo = { id: 'tax id', tax_amount_exclusive: 1275 };
    stripeMock.tax.calculations.create.mockResolvedValueOnce(taxInfo);

    const result = await getEstimatedTaxes(data, context, stripeMock);

    expect(result).toStrictEqual({
      taxCalculationId: taxInfo?.id,
      tax: 12.75
    });
    expect(stripeMock.tax.calculations.create).toHaveBeenCalledWith({
      currency: 'usd',
      shipping_cost: {
        amount: 4219,
      },
      line_items: [
        {
          amount: 83712,
          quantity: 1,
          reference: 'L1',
          tax_behavior: 'exclusive',
        },
      ],
      customer_details: {
        address: {
          line1: '123 main st',
          city: 'city',
          state: 'state',
          postal_code: 'zip',
          country: 'country',
        },
        address_source: 'shipping',
      },
    });
  });

  it("should handle unauthenticated user", async () => {
    const data = {
      shippingRateInCents: 4219,
      itemPriceInCents: 83712,
      taxableAddress: {
        street: '123 main st',
        city: 'city',
        state: 'state',
        zip: 'zip',
        country: 'country'
      },
    };
    const context = { auth: null };

    await expect(createLoginLink(data, context, stripeMock)).rejects.toThrow(
      'You must be authenticated to call this function.'
    );
    expect(stripeMock.tax.calculations.create).not.toHaveBeenCalled();
  });

  it("should handle error", async () => {
    const data = {
      shippingRateInCents: 4219,
      itemPriceInCents: 83712,
      taxableAddress: {
        street: '123 main st',
        city: 'city',
        state: 'state',
        zip: 'zip',
        country: 'country'
      },
    };
    const context = { auth: { uid: 'someUserId' } };
    jest.spyOn(logger, 'error').mockImplementation(() => { })
    const errorMessage = new Error('Error estimating taxes:');
    stripeMock.tax.calculations.create.mockRejectedValue(errorMessage)

    const result = await getEstimatedTaxes(data, context, stripeMock);

    expect(result).toBe(false);
    expect(stripeMock.tax.calculations.create).toHaveBeenCalledWith({
      currency: 'usd',
      shipping_cost: {
        amount: 4219,
      },
      line_items: [
        {
          amount: 83712,
          quantity: 1,
          reference: 'L1',
          tax_behavior: 'exclusive',
        },
      ],
      customer_details: {
        address: {
          line1: '123 main st',
          city: 'city',
          state: 'state',
          postal_code: 'zip',
          country: 'country',
        },
        address_source: 'shipping',
      },
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Error estimating taxes:', errorMessage.message
    );
  });
});

describe("createShipment", () => {
  let shippoMock;
  const data = {
    accountId: 'acct_123',
    toAddress: {
      street: 'main street 1',
      zip: 'zip 1'
    },
    fromAddress: {
      street: 'main street 2',
      zip: 'zip 2'
    },
    parcel: {},
  };
  beforeEach(() => {
    shippoMock = {
      shipments: {
        create: jest.fn(),
      },
    };
  });

  it("should retrieve the shippment", async () => {

    const context = { auth: { uid: 'someUserId' } };

    const shippment = { test: 'test info' };
    shippoMock.shipments.create.mockResolvedValueOnce(shippment);

    const result = await createShipment(data, context, shippoMock);

    expect(result).toBe(shippment);
    expect(shippoMock.shipments.create).toHaveBeenCalledWith({
      addressFrom: {
        zip: 'zip 2',
        street1: 'main street 2',
        street: 'main street 2',
      },
      addressTo: {
        zip: 'zip 1',
        street1: 'main street 1',
        street: 'main street 1',
      },
      parcels: [{}],
      async: false,
    });
  });

  it("should handle unauthenticated user", async () => {
    const context = { auth: null };

    await expect(createShipment(data, context, shippoMock)).rejects.toThrow(
      "Authentication required."
    );
    expect(shippoMock.shipments.create).not.toHaveBeenCalled();
  });

  it("should handle error", async () => {
    const context = { auth: { uid: 'someUserId' } };
    jest.spyOn(logger, 'error').mockImplementation(() => { })
    const error = new Error('error');
    shippoMock.shipments.create.mockRejectedValue(error)

    const result = await createShipment(data, context, shippoMock);

    expect(result).toStrictEqual({
      success: false,
      message: error.message,
      status: 'failed'
    })
    expect(shippoMock.shipments.create).toHaveBeenCalledWith({
      addressFrom: {
        zip: 'zip 2',
        street1: 'main street 2',
        street: 'main street 2',
      },
      addressTo: {
        zip: 'zip 1',
        street1: 'main street 1',
        street: 'main street 1',
      },
      parcels: [{}],
      async: false,
    });
    expect(logger.error).toHaveBeenCalledWith(
      JSON.stringify(error)
    );
  });
});

describe("createLabel", () => {
  let shippoMock;
  const data = {
    rateId: 'rateid',
    productId: 'productid'
  };
  beforeEach(() => {
    shippoMock = {
      transactions: {
        create: jest.fn(),
      },
    };
  });

  it("should create the label", async () => {
    const context = { auth: { uid: 'someUserId' } };

    const transaction = { test: 'test info' };
    shippoMock.transactions.create.mockResolvedValueOnce(transaction);

    const result = await createLabel(data, context, shippoMock);

    expect(result).toBe(transaction);
    expect(mockUpdate).toHaveBeenCalledWith({
      shippingLabelCreating: true
    })
    expect(shippoMock.transactions.create).toHaveBeenCalledWith({
      rate: 'rateid',
      label_file_type: "PDF",
      metadata: 'productid',
      labelFileType: 'PNG'
    });
  });

  it("should handle unauthenticated user", async () => {
    const context = { auth: null };

    await expect(createLabel(data, context, shippoMock)).rejects.toThrow(
      "Authentication required."
    );
    expect(shippoMock.transactions.create).not.toHaveBeenCalled();
  });

  it("should handle error", async () => {
    const context = { auth: { uid: 'someUserId' } };
    jest.spyOn(logger, 'error').mockImplementation(() => { })
    const error = new Error('error');
    shippoMock.transactions.create.mockRejectedValue(error)

    const result = await createLabel(data, context, shippoMock);

    expect(result).toStrictEqual({
      success: false,
      message: error.message,
      status: 'failed'
    })
    expect(shippoMock.transactions.create).toHaveBeenCalledWith({
      rate: 'rateid',
      label_file_type: "PDF",
      metadata: 'productid',
      labelFileType: 'PNG'
    });
    expect(logger.error).toHaveBeenCalledWith(
      JSON.stringify(error)
    );
  });
});

describe('validateAddress', () => {
  const shippoKey = 'test_shippo_key';

  const context = { auth: { uid: '123' } };
  const addressData = {
    street: '123 Main St',
    street2: 'Apt 4',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'US',
    name: 'John Doe',
  };

  const mockResponse = { is_valid: true };
  it('should validate address successfully', async () => {
    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const result = await validateAddress(addressData, context, shippoKey);

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://api.goshippo.com/v2/addresses/validate'),
      expect.objectContaining({ headers: { Authorization: `ShippoToken ${shippoKey}` } })
    );
    expect(result).toEqual(mockResponse);
  });

  it('should throw unauthenticated error if context.auth is missing', async () => {
    const invalidContext = {};

    await expect(validateAddress(addressData, invalidContext, shippoKey)).rejects.toThrow(
      'Authentication required.'
    );
  });

  it('should throw failed-precondition error if API key is missing', async () => {
    await expect(validateAddress(addressData, context, null)).rejects.toThrow(
      'Shippo API key not configured.'
    );
  });

  it('should throw internal error if axios request fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));

    await expect(validateAddress(addressData, context, shippoKey)).rejects.toThrow(
      'Failed to validate address', 'Network Error'
    );
    expect(logger.error).toHaveBeenCalledWith(JSON.stringify('Network Error'));
  });
});

describe('saveShippingLabel', () => {
  const mockReq = {
    body: {
      data: {
        label_url: 'https://example.com/label.pdf',
        metadata: 'product123',
        tracking_url_provider: 'https://track.example.com',
        tracking_number: '1234567890',
        status: 'SUCCESS',
      },
    },
    query: {
      token: 'valid_token',
    },
    headers: {},
  };
  const mockRes = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    send: jest.fn(),
  };
  const envToken = 'valid_token';

  it('should save shipping label successfully', async () => {
    await saveShippingLabel(mockReq, mockRes, envToken);

    expect(mockUpdate).toHaveBeenCalledWith({
      shippingLabel: 'https://example.com/label.pdf',
      shippingUrl: 'https://track.example.com',
      shippingNumber: '1234567890',
      shippingLabelCreating: false,
    });
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Shipping label saved successfully.',
    });
  });


  it('should return 401 if token is invalid', async () => {
    mockReq.query.token = 'invalid_token';
    await saveShippingLabel(mockReq, mockRes, envToken);

    expect(logger.warn).toHaveBeenCalledWith('Invalid webhook token');
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.send).toHaveBeenCalledWith('Unauthorized');
  });


  it('should return 400 if product ID or label URL is missing', async () => {
    mockReq.body.data.metadata = '';
    mockReq.query.token = 'valid_token';
    await saveShippingLabel(mockReq, mockRes, envToken);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Missing product ID or label URL.',
    });
  });


  it('should return 500 if firestore update fails', async () => {
    mockReq.body.data.metadata = 'productid';
    jest.spyOn(console, 'error').mockImplementation(() => ({}))
    mockUpdate.mockRejectedValueOnce(new Error('Firestore Error'));

    await saveShippingLabel(mockReq, mockRes, envToken);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Unable to save the label at this time, please try again.',
    });
  });
});

describe('orderTrackingUpdate', () => {
  const mockReq = {
    body: {
      data: {
        metadata: 'product123',
        tracking_status: {
          status: 'delivered',
          substatus: 'delivered',
        },
      },
      event: 'tracking_update',
    },
    query: {
      token: 'valid_token',
    },
    headers: {},
  };
  const mockRes = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    send: jest.fn(),
  };
  const envToken = 'valid_token';
  let mockOnUpdateOrderStatus
  beforeEach(async () => {
    mockOnUpdateOrderStatus = jest.fn();
    onUpdateOrderStatus.mockImplementation(() => ({onUpdateOrderStatus: mockOnUpdateOrderStatus}));
  });

  it('should process tracking update successfully', async () => {
    await orderTrackingUpdate(mockReq, mockRes, envToken);

    expect(onUpdateOrderStatus).toHaveBeenCalledWith({
      type: orderActions.DELIVERED,
      productId: 'product123',
    });
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith('Webhook received and logged');
  });

  it('should return 401 if token is invalid', async () => {
    mockReq.query.token = 'invalid_token';
    await orderTrackingUpdate(mockReq, mockRes, envToken);

    expect(logger.warn).toHaveBeenCalledWith('Invalid webhook token');
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.send).toHaveBeenCalledWith('Unauthorized');
  });

  it('should return 400 if product ID or tracking status is missing', async () => {
    mockReq.body.data.metadata = '';
    mockReq.query.token = 'valid_token';
    await orderTrackingUpdate(mockReq, mockRes, envToken);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Missing productId or tracking status.',
    });
  });

  it('should return 400 for unmapped tracking status', async () => {
    mockReq.body.data.metadata = 'productid';
    mockReq.body.data.tracking_status.substatus = 'unknown_status';
    await orderTrackingUpdate(mockReq, mockRes, envToken);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Unmapped tracking status received.',
    });
  });

  // it('should return 500 if onUpdateOrderStatus fails', async () => {
  //   // jest.spyOn(console, 'error').mockImplementation(() => ({}));
  //   mockReq.body.data.metadata = 'productid';
  //   mockReq.body.data.tracking_status = {
  //     substatus: orderActions.SHIPPED,
  //     status: orderActions.SHIPPED,
  //   };

  //   onUpdateOrderStatus.mockRejectedValueOnce(new Error('Order Status Error'));

  //   await orderTrackingUpdate(mockReq, mockRes, envToken);

  //   expect(mockRes.status).toHaveBeenCalledWith(500);
  //   expect(mockRes.send).toHaveBeenCalledWith('Internal Server Error');
  // });
});
