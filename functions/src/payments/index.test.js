import { https, logger } from 'firebase-functions'
import { addCardToPaymentIntent, confirmPaymentIntent, createLoginLink, createStripeAccount, getEstimatedTaxes, getLinkedAccounts, getStripeBalance } from './index'
import admin from '../../adminConfig'

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
      error: jest.fn(),
    },
    https: {
      onCall: jest.fn(),
      HttpsError: MockHttpsError,
    },
  };
});

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
