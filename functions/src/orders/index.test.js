import admin from '../../adminConfig.js';
import { createOrder, updateOrderStatus } from './index.js';
import { onUpdateOrderStatus } from './onUpdateOrderStatus.js';
import { logger } from 'firebase-functions';
import { sendEmail } from '../utils/index.js';
import { firestore } from 'firebase-admin';

const mockUpdate = jest.fn();
const mockGet = jest.fn().mockResolvedValue({
  exists: true,
  data: () => ({
    seller: 'sellerid',
    // selectedSwapSpot: 'swapSpotId',
  })
});
const mockAdd = jest.fn();
jest.mock('../../adminConfig.js', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        update: mockUpdate,
        get: mockGet,
        add: mockAdd,
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            update: mockUpdate,
            get: mockGet,
            add: mockAdd,
          }))
        }))
      })),
    })),
  })),
}));

jest.mock('../utils/index.js', () => ({
  ...jest.requireActual('../utils/index.js'),
  sendEmail: jest.fn().mockResolvedValue({}),
}));


jest.mock('./onUpdateOrderStatus', () => ({
  onUpdateOrderStatus: jest.fn()
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

describe('updateOrderStatus', () => {
  const mockData = { orderId: '12345', status: 'shipped' };
  const mockContext = { auth: { uid: 'user123' } };

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update order status successfully', async () => {
    onUpdateOrderStatus.mockResolvedValueOnce();

    const result = await updateOrderStatus(mockData, mockContext);

    expect(onUpdateOrderStatus).toHaveBeenCalledWith(mockData);
    expect(result).toEqual({
      success: true,
      message: 'Order status updated successfully.',
    });
  });

  it('should fail if authentication is missing', async () => {
    const result = await updateOrderStatus(mockData, {});

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        status: 'failed to update order status',
      })
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle onUpdateOrderStatus errors', async () => {
    const errorMessage = 'Failed to update order';
    onUpdateOrderStatus.mockRejectedValueOnce(new Error(errorMessage));

    const result = await updateOrderStatus(mockData, mockContext);

    expect(result).toEqual({
      success: false,
      message: errorMessage,
      status: 'failed to update order status',
    });
    expect(logger.error).toHaveBeenCalledWith(JSON.stringify(errorMessage));
  });
});

describe('createOrder', () => {
  const event = {
    params: {
      userId: 'user123',
      orderId: 'order456',
    },
  };

  const orderDoc = {
    exists: true,
    data: () => ({
      seller: 'seller789',
      taxCalculationId: 'taxCalc123',
      paymentIntent: 'pi_123',
      product: 'prod_456',
      purchaseDate: { seconds: 1633036800 },
      title: 'Sample Product',
      size: 'M',
      colors: ['Red', 'Blue'],
      price: 50,
      parcel: { length: 10, width: 5, height: 8, distanceUnit: 'in' },
      purchasePriceDetails: {
        tax: 10,
        total: 100,
      }
    }),
  };

  const buyerDoc = {
    exists: true,
    data: () => ({
      email: 'buyer@example.com',
      firstName: 'John',
      lastName: 'Doe',
    }),
  };

  const sellerDoc = {
    exists: true,
    data: () => ({
      email: 'seller@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      username: 'janesmith',
    }),
  };

  beforeEach(() => {
    mockGet
      .mockResolvedValueOnce(orderDoc)
      .mockResolvedValueOnce(buyerDoc)
      .mockResolvedValueOnce(sellerDoc);

    jest.clearAllMocks();
  });

  it('should successfully create an order and send emails', async () => {
    const mockStripe = {
      tax: { transactions: { createFromCalculation: jest.fn().mockResolvedValue({ id: 'tx_789' }) } },
      paymentIntents: { update: jest.fn().mockResolvedValue() },
    };
    await createOrder(event, mockStripe);

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(mockStripe.tax.transactions.createFromCalculation).toHaveBeenCalledWith({
      calculation: 'taxCalc123',
      reference: 'pi_123',
      expand: ['line_items'],
    });

    expect(mockStripe.paymentIntents.update).toHaveBeenCalledWith('pi_123', {
      metadata: { tax_transaction: 'tx_789', productId: 'prod_456' },
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      buyer: 'user123',
      active: false,
      status: 'PENDING_SHIPPING',
      purchaseDate: { seconds: 1633036800 },
      purchasePriceDetails: {
        tax: 10,
        total: 100,
      },
    })

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'buyer@example.com' })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'seller@example.com' })
    );
  });

  it('should log an error if order or user is not found', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    await createOrder(event);

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation();
    mockGet.mockRejectedValue(new Error(''));

    await createOrder(event);

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Order or User not found for userId: user123, orderId: order456')
    );
    expect(sendEmail).not.toHaveBeenCalled();
    loggerSpy.mockRestore();
  });

  it('should handle errors gracefully', async () => {
    const mockStripe = {
      tax: { transactions: { createFromCalculation: jest.fn().mockResolvedValue({ id: 'tx_789' }) } },
      paymentIntents: { update: jest.fn().mockResolvedValue() },
    };
    const error = new Error('Stripe error');
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation();
    mockStripe.tax.transactions.createFromCalculation.mockRejectedValue(error)

    await createOrder(event, mockStripe);

    expect(loggerSpy).toHaveBeenCalledWith("Error processing order creation: Stripe error", error);
    expect(sendEmail).not.toHaveBeenCalled();
    loggerSpy.mockRestore();
  });
});