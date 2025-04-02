import { sendNotificationToUser, addNotification } from '../utils/index.js';
import admin from '../../adminConfig.js';
import { dailyShippingReminder } from './dailyShippingReminder.js';
import { statusTypes } from '../../order.config.js';
import { subBusinessDays } from 'date-fns';

jest.mock('../../adminConfig.js');
const mockUpdate = jest.fn();
const mockGet = jest.fn();
admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  update: mockUpdate,
  get: mockGet,
});
jest.mock('../utils/index.js', () => ({
  sendNotificationToUser: jest.fn(),
  addNotification: jest.fn(),
}))
jest.mock('firebase-functions', () => {
  return {
    logger: {
      info: jest.fn(),
    },
  }
});

describe('dailyShippingReminder', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => { });
    jest.spyOn(console, 'log').mockImplementation(() => { });
    // jest.spyOn(console, 'info').mockImplementation(() => { });
    jest.clearAllMocks();
  });

  it('should log and return null if no products require shipping reminders', async () => {
    mockGet.mockResolvedValueOnce({ empty: true });

    const result = await dailyShippingReminder();

    expect(console.log).toHaveBeenCalledWith("No products requiring shipping reminders.");
    expect(result).toBeNull();
  });

  it('should send notifications for products with 1, 2, or 3 business days passed', async () => {
    const twoBusinessDaysAgo = subBusinessDays(new Date(), 2)
      const mockSnapshot = {
      empty: false,
      forEach: (callback) => {
        callback({
          id: 'product1',
          data: () => ({
            purchaseDate: { toDate: () => twoBusinessDaysAgo },
            status: statusTypes.productStatus.LABEL_CREATED,
            user: 'user1',
            title: 'Product 1',
            isBundle: false,
          }),
        });
      },
    };
    mockGet.mockResolvedValueOnce(mockSnapshot);

    await dailyShippingReminder();

    expect(sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'user1',
      type: 'seller_shipping_reminder_2',
      args: {
        title: 'Product 1',
        date: twoBusinessDaysAgo.toISOString(),
      },
    });
    expect(addNotification).not.toHaveBeenCalled();
  });

  it('should send last shipping day notification for 3 business days passed', async () => {
    const threeBusinessDaysAgo = subBusinessDays(new Date(), 3)
    const mockSnapshot = {
      empty: false,
      forEach: (callback) => {
        callback({
          id: 'product2',
          data: () => ({
            purchaseDate: { toDate: () => threeBusinessDaysAgo },
            status: statusTypes.productStatus.LABEL_CREATED,
            user: 'user2',
            title: 'Product 2',
            isBundle: false,
          }),
        });
      },
    };
    mockGet.mockResolvedValueOnce(mockSnapshot);

    await dailyShippingReminder();

    expect(sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'user2',
      type: 'seller_shipping_reminder_3',
      args: {
        title: 'Product 2',
        date: threeBusinessDaysAgo.toISOString(),
      },
    });
    expect(addNotification).toHaveBeenCalledWith({
      type: 'last_shipping_day',
      recipientId: 'user2',
      productId: 'product2',
      productBundleAmount: 0,
    });
  });

  it('should update refund eligibility and notify buyer for 4 business days passed', async () => {
    const fourBusinessDaysAgo = subBusinessDays(new Date(), 4)
    const mockSnapshot = {
      empty: false,
      forEach: (callback) => {
        callback({
          id: 'product3',
          data: () => ({
            purchaseDate: { toDate: () => fourBusinessDaysAgo },
            status: statusTypes.productStatus.LABEL_CREATED,
            buyer: 'buyer1',
            orderId: 'order1',
            title: 'Product 3',
            isBundle: false,
          }),
        });
      },
    };
    mockGet.mockResolvedValueOnce(mockSnapshot);

    await dailyShippingReminder();

    expect(mockUpdate).toHaveBeenCalledWith({
      canRequestRefund: true,
    });
    expect(addNotification).toHaveBeenCalledWith({
      type: 'buyer_refund_eligibility',
      recipientId: 'buyer1',
      productId: 'product3',
      orderId: 'order1',
      productBundleAmount: 0,
    });
    expect(sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'buyer1',
      type: 'buyer_refund_eligibility',
      args: {
        title: 'Product 3',
      },
    });
  });
});
