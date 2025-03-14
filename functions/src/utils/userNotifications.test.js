import { addNotification, onNewNotification } from './userNotifications';
import admin from '../../adminConfig.js';
import { https } from 'firebase-functions';

jest.mock('../../adminConfig.js');
jest.mock('firebase-functions', () => ({
  https: {
    HttpsError: jest.fn(),
  },
  logger: {
    info: jest.fn(),
  },
}));
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  update: mockUpdate,
  doc: jest.fn().mockReturnThis(),
  set: mockSet,
  get: mockGet,
  where: jest.fn().mockReturnThis(),
});

admin.firestore.FieldValue = {
  increment: () => 1,
}

admin.firestore.Timestamp = {
  now: () => 'now',
}
jest.spyOn(console, 'log').mockImplementation(() => { })
describe('addNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add a new notification successfully', async () => {
    const mockData = {
      type: 'new_follower',
      recipientId: 'recipient123',
      userId: 'user123',
    };

    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ profileImage: 'image_url', username: 'user123' }),
    });

    const result = await addNotification(mockData);

    expect(result).toEqual({ success: true, id: undefined });
    expect(mockSet).toHaveBeenCalledWith({
      createdAt: "now",
      id: undefined,
      imageUrl: "image_url",
      isRead: false,
      message: "started following you.",
      productBundleAmount: 0,
      recipientId: "recipient123",
      title: "New Follower",
      type: "new_follower",
      userId: undefined,
      userSnapshot: {
        id: undefined,
        username: "user123"
      }
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      notifications: 1
    });
  });

  it('should handle errors when adding a notification', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => { })
    const mockData = {
      type: 'new_follower',
      recipientId: 'recipient123',
      userId: 'user123',
    };

    mockGet.mockRejectedValueOnce(new Error('Firestore error'));

    const result = await addNotification(mockData);

    expect(result).toEqual({ success: false, error: 'Firestore error' });
  });
});

describe('onNewNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle unauthenticated users', async () => {
    const mockContext = { auth: null };
    const mockData = {};

    try {
      await onNewNotification(mockData, mockContext);
    } catch (error) {
      expect(error).toBeInstanceOf(https.HttpsError);
      // expect(error.code).toBe('unauthenticated');
    }
  });

  it('should add a new notification for authenticated users', async () => {
    const mockContext = { auth: { uid: 'user123' } };
    const mockData = {
      type: 'new_follower',
      recipientId: 'recipient123',
      userId: 'user123',
    };

    // const mockAddNotification = jest.fn().mockResolvedValue({ success: true, id: 'notification123' });
    // addNotification.mockImplementation(mockAddNotification);
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ profileImage: 'image_url', username: 'user123' }),
    });

    const result = await onNewNotification(mockData, mockContext);

    expect(result).toEqual({ success: true, notificationId: { success: true, id: undefined } });
    // expect(mockAddNotification).toHaveBeenCalledWith(mockData);
  });

  it('should handle errors when adding a notification', async () => {
    const mockContext = { auth: { uid: 'user123' } };
    const mockData = {
      type: 'new_follower',
      recipientId: 'recipient123',
      userId: 'user123',
    };
    mockGet.mockRejectedValueOnce(new Error('Firestore error'));

    try {
      await onNewNotification(mockData, mockContext);
    } catch (error) {
      expect(error).toBeInstanceOf(https.HttpsError);
      expect(error.code).toBe('internal');
    }
  });
});