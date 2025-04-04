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
      body: 'Your order for Sample Product has been placed successfully. We\'ll notify you when it\'s shipped!'
    },
    {
      type: 'buyer_' + productStatus.LABEL_CREATED,
      notificationTitle: '📦 Shipping label created!',
      body: 'Your order for Sample Product has a shipping label. We\'ll notify you when it\'s shipped!'
    },
    {
      type: 'buyer_' + productStatus.SHIPPED,
      notificationTitle: '🚚 Your Item is on the way!',
      body: 'Your order for Sample Product has been shipped. Track its progress in the app.'
    },
    {
      type: 'buyer_' + productStatus.OUT_FOR_DELIVERY,
      notificationTitle: '🚚 Your Item is out for delivery!',
      body: 'Your order for Sample Product is out for delivery. Track its progress in the app.'
    },
    {
      type: 'buyer_' + productStatus.PENDING_SWAPSPOT_PICKUP,
      notificationTitle: '📍 Your Item is Ready for Pickup!',
      body: 'Sample Product is now available at undefined. Pick it up at your convenience!'
    },
    {
      type: 'buyer_' + productStatus.COMPLETED,
      notificationTitle: '📝 Rate Your Experience',
      body: 'Let us know how your purchase of Sample Product went. Leave a review and help others!'
    },
    {
      type: 'seller_' + productStatus.PENDING_SHIPPING,
      notificationTitle: '🎉 New Order Received!',
      body: 'Sample Product has sold!.'
    },
    {
      type: 'seller_' + orderActions.DELIVERED,
      notificationTitle: '🎉 Payment confirmation for your sale!',
      body: 'Congratulations! Your payment on Little Swaps has been processed.'
    },
    {
      type: 'swapspot_' + productStatus.PENDING_SWAPSPOT_ARRIVAL,
      notificationTitle: '📦 Incoming Package!',
      body: 'A new package, Sample Product, is on its way to your location.'
    },
    {
      type: 'DELIVERED',
      notificationTitle: '📍 New Item Delivered!',
      body: 'Sample Product has arrived.'
    },
    {
      type: 'buyer_refund_eligibility',
      notificationTitle: "💰 Refund Available!",
      body: `Your order for Sample Product has not been shipped. You may now request a refund if needed.`,
    },
    {
      type: 'seller_shipping_reminder_3',
      notificationTitle: "⚠️ Last Chance to Ship!",
      body: `Urgent: Sample Product must be shipped today! The buyer can request a refund if it is not shipped.`,
    },
    {
      type: 'seller_shipping_reminder_2',
      notificationTitle: "🚀 Shipping Reminder!",
      body: `Reminder: Sample Product still needs to be shipped. Please send it as soon as possible!`,
    },
    {
      type: 'seller_shipping_reminder_1',
      notificationTitle: "🚀 Don't Forget to Ship!",
      body: `Your order for Sample Product was placed recently. Please ship it soon to keep the buyer happy!`,
    },
  ];

  testCases.forEach(({ type, notificationTitle, body }) => {
    it(`should send notification for type ${type}`, async () => {
      const args = { title: mockTitle };
      admin.firestore().get.mockResolvedValue({ exists: true, data: () => ({ pushToken: 'fcmToken123' }) });
      admin.messaging().send.mockResolvedValue('messageId123');

      const result = await sendNotificationToUser({ userId: mockUserId, type, args });

      expect(admin.messaging().send).toHaveBeenCalledWith({
        notification: {
          body: body,
          title: notificationTitle
        }, 
        "token": "fcmToken123"
      });
      expect(result).toEqual('messageId123');
    });
  });

  it('should log an error if no user document is found', async () => {
    admin.firestore().get.mockResolvedValue({ exists: false });

    await sendNotificationToUser({ userId: mockUserId, type: 'buyer_' + productStatus.SHIPPED, args: { title: mockTitle } });

    expect(logger.warn).toHaveBeenCalledWith('No user document found for user ID:', mockUserId);
    expect(admin.messaging().send).not.toHaveBeenCalled();
  });

  it('should log an error if no FCM token is found', async () => {
    admin.firestore().get.mockResolvedValue({ exists: true, data: () => ({}) });

    await sendNotificationToUser({ userId: mockUserId, type: 'buyer_' + productStatus.LABEL_CREATED, args: { title: mockTitle } });

    expect(logger.warn).toHaveBeenCalledWith('No FCM token found for user:', mockUserId);
    expect(admin.messaging().send).not.toHaveBeenCalled();
  });

  it('should log a warning for unhandled notification type', async () => {
    await sendNotificationToUser({ userId: mockUserId, type: 'unknown_type', args: { title: mockTitle } });

    expect(logger.warn).toHaveBeenCalledWith('Unhandled notification type: unknown_type');
    expect(admin.messaging().send).not.toHaveBeenCalled();
  });
});
