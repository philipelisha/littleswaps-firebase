import admin from '../../adminConfig.js';
import { orderActions, statusTypes } from '../../order.config.js';
import { sendNotificationToUser } from '../utils/index.js';
import { onUpdateOrderStatus } from './onUpdateOrderStatus.js';
import { sendDeliveredEmails, sendShippedEmails } from './sendOrderUpdateEmails.js';
const { productStatus } = statusTypes;

// Mock Firestore methods
let mockGet = jest.fn().mockResolvedValue();
let mockUpdate = jest.fn()
let mockWhere = jest.fn().mockReturnThis();

jest.mock('../../adminConfig.js', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockGet,
        update: mockUpdate,
        where: mockWhere,
        doc: jest.fn().mockReturnThis(),
        collection: jest.fn().mockReturnThis(),
      })),
    })),
  })),
}));

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  https: {
    onCall: jest.fn(),
    HttpsError: jest.fn().mockResolvedValue(),
  },
}));

jest.spyOn(console, 'error').mockImplementation(() => { })

jest.mock('../utils/index.js', () => ({
  ...jest.requireActual('../utils/index.js'),
  sendNotificationToUser: jest.fn().mockResolvedValue(),
}))

jest.mock('./sendOrderUpdateEmails.js', () => ({
  sendShippedEmails: jest.fn().mockResolvedValue(),
  sendDeliveredEmails: jest.fn().mockResolvedValue(),
}))

beforeEach(() => {
  jest.clearAllMocks();
});

describe('onUpdateOrderStatus', () => {
  const mockSwapSpotId = 'swapSpot789';
  const mockProductId = 'product456';
  const mockOrderData = {
    product: mockProductId,
    id: 'orderid',
    data: () => ({
      id: 'orderid',
      product: mockProductId,
      title: 'Test Product',
      shippingCarrier: 'shippingCarrier',
      shippingNumber: 'shippingNumber',
      paymentIntent: 'pi_12345',
      purchasePriceDetails: {
        total: 150,
        shippingRate: 15,
        commission: 5,
        swapSpotCommission: 3,
      }
    }),
  };
  const mockSwapSpotData = {
    data: () => ({
      buyer: 'buyerid',
      seller: 'sellerid',
      stripeAccountId: 'swap stripe account id',
    }),
  };
  const mockProductData = {
    buyer: 'buyerid',
    user: 'sellerid',
    title: 'Test Product',
    shippingNumber: 'shippingNumber',
    price: 100,
    colors: ['red', 'green'],
    purchasePriceDetails: {
      total: 150,
      shippingRate: 15,
      commission: 5,
      swapSpotCommission: 3,
    },
    data: () => ({
      ...mockProductData
    })
  };

  const mockStripe = {
    paymentIntents: {
      retrieve: jest.fn().mockResolvedValue({
        amount_received: 10000,
        latest_charge: 'charge id'
      })
    },
    transfers: {
      create: jest.fn().mockResolvedValue()
    }
  }

  describe('when the label was created', () => {
    let mockOrderUpdate = jest.fn();
    beforeEach(() => {
      mockGet
        .mockResolvedValueOnce({
          data: jest.fn(() => mockProductData),
        })
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              ...mockOrderData,
              ref: {
                update: mockOrderUpdate
              }
            }
          ],
        });
    });

    it('should update the order and product status', async () => {
      const result = await onUpdateOrderStatus({
        type: orderActions.LABEL_CREATED,
        swapSpotId: mockSwapSpotId,
        productId: mockProductId,
      });

      expect(mockWhere).toHaveBeenCalledWith('product', '==', mockProductId);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'LABEL_CREATED',
        purchaseStatusUpdated: expect.any(Date),
      });
      expect(mockOrderUpdate).toHaveBeenCalledWith({
        status: 'LABEL_CREATED',
        updated: expect.any(Date),
      });
      expect(sendNotificationToUser).toHaveBeenCalledWith({
        userId: 'buyerid',
        type: 'buyer_' + productStatus.LABEL_CREATED,
        args: {
          title: 'Test Product'
        }
      })
      expect(result).toBeTruthy();
    });
  });

  describe('when out for delivery', () => {
    let mockOrderUpdate = jest.fn();
    beforeEach(() => {
      mockGet
        .mockResolvedValueOnce({
          data: jest.fn(() => mockProductData),
        })
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              ...mockOrderData,
              ref: {
                update: mockOrderUpdate
              }
            }
          ],
        });
    });

    it('should update the order and product status', async () => {
      const result = await onUpdateOrderStatus({
        type: orderActions.OUT_FOR_DELIVERY,
        swapSpotId: mockSwapSpotId,
        productId: mockProductId,
      });

      expect(mockWhere).toHaveBeenCalledWith('product', '==', mockProductId);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'OUT_FOR_DELIVERY',
        purchaseStatusUpdated: expect.any(Date),
      });
      expect(mockOrderUpdate).toHaveBeenCalledWith({
        status: 'OUT_FOR_DELIVERY',
        updated: expect.any(Date),
      });
      expect(sendNotificationToUser).toHaveBeenCalledWith({
        userId: 'buyerid',
        type: 'buyer_' + productStatus.OUT_FOR_DELIVERY,
        args: {
          title: 'Test Product'
        }
      })
      expect(result).toBeTruthy();
    });
  });

  describe('when shipped', () => {
    let mockOrderUpdate = jest.fn();
    const mockSellerData = {
      email: 'seller email',
      firstName: 'seller first name',
      lastName: 'seller last name',
    };
    const mockBuyerData = {
      email: "buyer email",
      firstName: 'buyer first name',
      lastName: 'buyer last name',
    };
    const mockAddressData = {
      name: 'buyer address',
      street: '123 main st',
      street2: 'apt 21',
      city: 'Cityville',
      zip: '999999'
    };
    beforeEach(() => {
      mockGet
        .mockResolvedValueOnce({
          data: jest.fn(() => mockProductData),
        })
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              ...mockOrderData,
              ref: {
                update: mockOrderUpdate
              }
            }
          ],
        })
        .mockResolvedValueOnce({
          data: () => (mockSellerData)
        })
        .mockResolvedValueOnce({
          data: () => (mockBuyerData)
        })
        .mockResolvedValueOnce({
          data: () => (mockAddressData)
        })
    });

    it('should update the order and product status', async () => {
      const result = await onUpdateOrderStatus({
        type: orderActions.SHIPPED,
        swapSpotId: mockSwapSpotId,
        productId: mockProductId,
      });

      expect(mockWhere).toHaveBeenCalledWith('product', '==', mockProductId);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: productStatus.SHIPPED,
        purchaseStatusUpdated: expect.any(Date),
      });
      expect(mockOrderUpdate).toHaveBeenCalledWith({
        status: productStatus.SHIPPED,
        updated: expect.any(Date),
      });
      expect(sendNotificationToUser).toHaveBeenCalledWith({
        userId: 'buyerid',
        type: 'buyer_' + productStatus.SHIPPED,
        args: {
          title: 'Test Product'
        }
      })
      expect(sendShippedEmails).toHaveBeenCalledWith({
        buyer: mockBuyerData,
        seller: mockSellerData,
        product: mockProductData.data(),
        order: mockOrderData.data(),
        address: mockAddressData,
      })
      expect(result).toBeTruthy();
    });
  });

  describe('when a swap spot is receiving', () => {
    let mockOrderUpdate = jest.fn();
    let mockSwapSpotUpdate = jest.fn();
    beforeEach(() => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              ...mockSwapSpotData,
              ref: {
                update: mockSwapSpotUpdate
              }
            }
          ],
        })
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              ...mockOrderData,
              ref: {
                update: mockOrderUpdate
              }
            }
          ],
        })
        .mockResolvedValueOnce({
          data: jest.fn(() => mockProductData),
        })
    });

    it('should update the order and product status', async () => {
      const result = await onUpdateOrderStatus({
        type: orderActions.SWAPSPOT_RECEIVING,
        swapSpotId: mockSwapSpotId,
        productId: mockProductId,
      });

      expect(mockWhere).toHaveBeenCalledWith('product', '==', mockProductId);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'PENDING_SWAPSPOT_PICKUP',
        purchaseStatusUpdated: expect.any(Date),
      });
      expect(mockSwapSpotUpdate).toHaveBeenCalledWith({
        status: 'PENDING_SWAPSPOT_PICKUP',
        updated: expect.any(Date),
      });
      expect(mockOrderUpdate).toHaveBeenCalledWith({
        status: 'PENDING_SWAPSPOT_PICKUP',
        updated: expect.any(Date),
      });
      expect(sendNotificationToUser).toHaveBeenCalledWith({
        userId: 'buyerid',
        type: 'buyer_' + productStatus.PENDING_SWAPSPOT_PICKUP,
        args: {
          title: 'Test Product'
        }
      })
      expect(result).toBeTruthy();
    });
  });

  describe('when delivered', () => {
    let mockOrderUpdate = jest.fn();
    const mockSellerData = {
      email: 'seller email',
      firstName: 'seller first name',
      lastName: 'seller last name',
      stripeAccountId: 'account id',
    };
    const mockBuyerData = {
      email: "buyer email",
      firstName: 'buyer first name',
      lastName: 'buyer last name',
    };
    beforeEach(() => {
      mockGet
        .mockResolvedValueOnce({
          data: jest.fn(() => mockProductData),
        })
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              ...mockOrderData,
              ref: {
                update: mockOrderUpdate
              }
            }
          ],
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => (mockSellerData)
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => (mockSellerData)
        })
        .mockResolvedValueOnce({
          data: () => (mockBuyerData)
        })
    });

    it('should update the order and product status', async () => {
      const result = await onUpdateOrderStatus({
        type: orderActions.DELIVERED,
        productId: mockProductId,
        stripe: mockStripe
      });

      expect(mockWhere).toHaveBeenCalledWith('product', '==', mockProductId);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: productStatus.COMPLETED,
        purchaseStatusUpdated: expect.any(Date),
      });
      expect(mockOrderUpdate).toHaveBeenCalledWith({
        status: productStatus.COMPLETED,
        updated: expect.any(Date),
      });
      expect(mockStripe.transfers.create).toHaveBeenCalledWith({
        amount: 7700,
        currency: 'usd',
        destination: "account id",
        source_transaction: 'charge id',
      })
      expect(sendNotificationToUser).toHaveBeenCalledWith({
        userId: mockProductData.user,
        type: 'seller_' + orderActions.DELIVERED,
        args: {
        }
      })
      expect(sendNotificationToUser).toHaveBeenCalledWith({
        userId: mockProductData.buyer,
        type: orderActions.DELIVERED,
        args: {
          title: mockProductData.title
        }
      })
      expect(sendDeliveredEmails).toHaveBeenCalledWith({
        product: mockProductData.data(),
        order: mockOrderData.data(),
        seller: mockSellerData,
        buyer: mockBuyerData,
      })
      expect(result).toBeTruthy();
    });
  });

  describe('when fulfilled by a swap spot', () => {
    let mockOrderUpdate = jest.fn();
    let mockSwapSpotUpdate = jest.fn();
    const mockSellerData = {
      email: 'seller email',
      firstName: 'seller first name',
      lastName: 'seller last name',
      stripeAccountId: 'account id',
    };
    const mockBuyerData = {
      email: "buyer email",
      firstName: 'buyer first name',
      lastName: 'buyer last name',
    };
    beforeEach(() => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              ...mockSwapSpotData,
              ref: {
                update: mockSwapSpotUpdate
              }
            }
          ],
        })
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              ...mockOrderData,
              ref: {
                update: mockOrderUpdate
              }
            }
          ],
        })
        .mockResolvedValueOnce({
          data: jest.fn(() => mockProductData),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => (mockSwapSpotData.data())

        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => (mockSellerData)
        })
    });

    it('should update the order and product status', async () => {
      const result = await onUpdateOrderStatus({
        type: orderActions.SWAPSPOT_FULFILLMENT,
        productId: mockProductId,
        swapSpotId: mockSwapSpotId,
        stripe: mockStripe
      });

      expect(mockWhere).toHaveBeenCalledWith('product', '==', mockProductId);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: productStatus.COMPLETED,
        purchaseStatusUpdated: expect.any(Date),
      });
      expect(mockOrderUpdate).toHaveBeenCalledWith({
        status: productStatus.COMPLETED,
        updated: expect.any(Date),
      });
      expect(mockStripe.transfers.create).toHaveBeenCalledWith({
        amount: 300,
        currency: 'usd',
        destination: "swap stripe account id",
        source_transaction: "charge id",
      })
      expect(mockStripe.transfers.create).toHaveBeenCalledWith({
        amount: 7700,
        currency: 'usd',
        destination: "account id",
        source_transaction: "charge id",
      })
      expect(sendNotificationToUser).toHaveBeenCalledWith({
        userId: mockProductData.user,
        type: 'seller_' + orderActions.SWAPSPOT_FULFILLMENT,
        args: {}
      })
      expect(sendNotificationToUser).toHaveBeenCalledWith({
        userId: mockProductData.buyer,
        type: 'buyer_' + productStatus.COMPLETED,
        args: {
          title: mockProductData.title
        }
      })
      expect(result).toBeTruthy();
      });
    });
  });
