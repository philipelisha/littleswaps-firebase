import { createUser, defaultProfileImage, updateUser } from './index.js';
import admin from '../../adminConfig.js';
import { sendEmail } from '../utils/index.js';
import { logger } from 'firebase-functions';

jest.mock('../../adminConfig.js');
jest.mock('../utils/index.js', () => ({
  ...jest.requireActual('../utils/index.js'),
  sendEmail: jest.fn().mockResolvedValue(),
}));
jest.mock('firebase-functions', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const mockUserDoc = (data) => ({
  data: () => data,
  exists: !!data,
  ref: {
    update: jest.fn(),
  },
});

const mockSnapshot = (docs) => ({
  empty: docs.length === 0,
  forEach: (callback) => docs.forEach(callback),
});

const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn();
const mockBatch = {
  update: mockBatchUpdate,
  commit: mockBatchCommit,
};
const mockGet = jest.fn();
admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  get: mockGet,
  batch: jest.fn().mockReturnValue(mockBatch),
  where: jest.fn().mockReturnThis(),
});

const event = {
  params: { userId: '123' },
  data: {
    before: mockUserDoc({ email: null }),
    after: mockUserDoc({ email: 'test@example.com', firstName: 'John', lastName: 'Doe' }),
  },
};

describe('User Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createUser sends welcome email if email exists', async () => {
    admin.firestore().get.mockResolvedValue(mockUserDoc({
      email: 'test@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    }));

    await createUser(event);

    expect(sendEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
      templateId: expect.any(String),
      data: expect.objectContaining({ firstName: 'Jane' }),
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('createUser logs error if fetching user fails', async () => {
    admin.firestore().get.mockRejectedValue(new Error('Firestore error'));

    await createUser(event);

    expect(logger.error).toHaveBeenCalledWith('Problem sending the welcome email: ', 'Firestore error');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('updateUser triggers email if email is added', async () => {
    await updateUser(event);

    expect(sendEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
      templateId: expect.any(String),
      data: expect.objectContaining({ firstName: 'John' }),
    });
    expect(logger.info).toHaveBeenCalledWith('beforeData', { email: null });
    expect(logger.info).toHaveBeenCalledWith('afterData', expect.any(Object));
  });

  it('updateUser does not send email if email was not added', async () => {
    event.data.before = mockUserDoc({ email: 'existing@example.com' });
    await updateUser(event);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('updateUser when profile image is updated it updates the likes', async () => {
    event.data.before = mockUserDoc({ profileImage: 'old image' });
    event.data.after = mockUserDoc({
      profileImage: 'new image',
      username: 'username'
    });
    mockGet.mockImplementation(() => ([
      { ref: { id: 'like1' } },
      { ref: { id: 'like2' } }
    ]));

    await updateUser(event);

    expect(mockBatchUpdate).toHaveBeenCalledWith({ id: 'like1' }, expect.objectContaining({
      userImage: 'new image',
      username: 'username'
    }));
    expect(mockBatchUpdate).toHaveBeenCalledWith({ id: 'like2' }, expect.objectContaining({
      userImage: 'new image',
      username: 'username'
    }));

    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it('updateUser when username is updated it updates the likes', async () => {
    event.data.before = mockUserDoc({ profileImage: 'old image' });
    event.data.after = mockUserDoc({
      username: 'username',
      comments: [
        'comment 1',
        'comment 2',
      ]
    });
    const mockUpdate = jest.fn();
    mockGet.mockImplementation(() => ([
      {
        ref: {
          update: mockUpdate,
        }
      },
      {
        ref: {
          update: mockUpdate,
        }
      }
    ]));

    await updateUser(event);

    expect(mockUpdate).toHaveBeenCalledWith({
      userImage: defaultProfileImage,
      username: 'username'
    });
  });

  it('updateUser when username is updated it updates the followers', async () => {
    event.data.before = mockUserDoc({ profileImage: 'old image' });
    event.data.after = mockUserDoc({
      username: 'username',
    });
    mockGet.mockImplementation(() => ([
      { ref: { id: 'follower1' } },
      { ref: { id: 'follower2' } }
    ]));

    await updateUser(event);

    expect(mockBatchUpdate).toHaveBeenCalledWith({ id: 'follower1' }, expect.objectContaining({
      followerImage: defaultProfileImage,
      followerName: 'username'
    }));
    expect(mockBatchUpdate).toHaveBeenCalledWith({ id: 'follower2' }, expect.objectContaining({
      userImage: defaultProfileImage,
      username: 'username'
    }));

    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it('syncReviews updates seller and buyer reviews with new user info', async () => {
    const userId = 'user123';
    event.data.before = mockUserDoc({ profileImage: 'old image' });
    event.data.after = mockUserDoc({
      profileImage: 'new image',
      username: 'username',
    });

    const mockReviewGivenSnapshot = [
      {
        data: () => ({
          seller: 'seller id'
        }),
        ref: { id: 'buyer id' }
      }
    ];
    const mockReviewSnapshot = [
      { ref: { id: 'review id' } }
    ];

    const mockGet = jest.fn()
      .mockResolvedValueOnce(mockReviewGivenSnapshot)
      .mockResolvedValueOnce(mockReviewSnapshot);

    jest.spyOn(admin.firestore().collection('users').doc(userId).collection(), 'get').mockImplementation(mockGet);

    await updateUser(event);

    // expect(mockBatchUpdate).toHaveBeenCalledWith(mockReviewSnapshot[0].ref, expect.objectContaining({
    //   buyerUserImage: 'new image',
    //   buyerUsername: 'username',
    // }));
    // expect(mockBatchUpdate).toHaveBeenCalledWith(mockBuyerReviewRef, expect.objectContaining({
    //   sellerUserImage: 'new image',
    //   sellerUsername: 'username',
    // }));

    // expect(mockBatchCommit).toHaveBeenCalled();
  });
});
