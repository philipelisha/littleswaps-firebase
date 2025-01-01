import admin from '../../adminConfig.js';
import { logger } from 'firebase-functions';
import { sendNotificationToUser } from './pushNotifications.js';
import { orderActions, statusTypes } from '../../order.config.js';

const { productStatus } = statusTypes;

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

jest.mock('../../adminConfig.js', () => ({
  firestore: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn(),
  }),
  messaging: jest.fn().mockReturnValue({
    send: jest.fn(),
  })
}));

describe('sendNotificationToUser', () => {
  const mockUserId = 'user123';
  const mockTitle = 'Sample Product';
  const mockPayload = (title, notificationTitle, body) => ({
    message: {
      notification: {
        title: notificationTitle,
        body: body.replace('{title}', title),
      }
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const testCases = [
    {
      type: 'buyer_' + productStatus.PENDING_SHIPPING,
      notificationTitle: '📦 Order Confirmed!',
      body: 'Your order for {title} has been placed successfully. We\'ll notify you when it\'s shipped!'
    },
    {
      type: 'buyer_' + productStatus.LABEL_CREATED,
      notificationTitle: '📦 Shipping label created!',
      body: 'Your order for {title} has a shipping label. We\'ll notify you when it\'s shipped!'
    },
    {
      type: 'buyer_' + productStatus.SHIPPED,
      notificationTitle: '🚚 Your Item is on the way!',
      body: 'Your order for {title} has been shipped. Track its progress in the app.'
    },
    {
      type: 'buyer_' + productStatus.OUT_FOR_DELIVERY,
      notificationTitle: '🚚 Your Item is out for delivery!',
      body: 'Your order for {title} is out for delivery. Track its progress in the app.'
    },
    {
      type: 'buyer_' + productStatus.PENDING_SWAPSPOT_PICKUP,
      notificationTitle: '📍 Your Item is Ready for Pickup!',
      body: '{title} is now available at your swap spot. Pick it up at your convenience!'
    },
    {
      type: 'buyer_' + productStatus.COMPLETED,
      notificationTitle: '📝 Rate Your Experience',
      body: 'Let us know how your purchase of {title} went. Leave a review and help others!'
    },
    {
      type: 'seller_' + productStatus.PENDING_SHIPPING,
      notificationTitle: '🎉 New Order Received!',
      body: '{title} has sold!.'
    },
    {
      type: 'seller_' + orderActions.DELIVERED,
      notificationTitle: '🎉 Payment confirmation for your sale!',
      body: 'Congratulations! Your payment on Little Swaps has been processed.'
    },
    {
      type: 'swapspot_' + productStatus.PENDING_SWAPSPOT_ARRIVAL,
      notificationTitle: '📦 Incoming Package!',
      body: 'A new package, {title}, is on its way to your location.'
    },
    {
      type: 'DELIVERED',
      notificationTitle: '📍 New Item Delivered!',
      body: '{title} has arrived.'
    }
  ];

  testCases.forEach(({ type, notificationTitle, body }) => {
    it(`should send notification for type ${type}`, async () => {
      const args = { title: mockTitle };
      admin.firestore().get.mockResolvedValue({ exists: true, data: () => ({ pushToken: 'fcmToken123' }) });
      admin.messaging().send.mockResolvedValue('messageId123');

      const result = await sendNotificationToUser({ userId: mockUserId, type, args });

      expect(admin.messaging().send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(Object) }));
      expect(result).toEqual('messageId123');
    });
  });

  it('should log an error if no user document is found', async () => {
    admin.firestore().get.mockResolvedValue({ exists: false });
    
    await sendNotificationToUser({ userId: mockUserId, type: 'buyer_' + productStatus.SHIPPED, args: { title: mockTitle } });

    expect(logger.error).toHaveBeenCalledWith('No user document found for user ID:', mockUserId);
    expect(admin.messaging().send).not.toHaveBeenCalled();
  });

  it('should log an error if no FCM token is found', async () => {
    admin.firestore().get.mockResolvedValue({ exists: true, data: () => ({}) });

    await sendNotificationToUser({ userId: mockUserId, type: 'buyer_' + productStatus.LABEL_CREATED, args: { title: mockTitle } });

    expect(logger.error).toHaveBeenCalledWith('No FCM token found for user:', mockUserId);
    expect(admin.messaging().send).not.toHaveBeenCalled();
  });

  it('should log a warning for unhandled notification type', async () => {
    await sendNotificationToUser({ userId: mockUserId, type: 'unknown_type', args: { title: mockTitle } });

    expect(logger.warn).toHaveBeenCalledWith('Unhandled notification type: unknown_type');
    expect(admin.messaging().send).not.toHaveBeenCalled();
  });
});
