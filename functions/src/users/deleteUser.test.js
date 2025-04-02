import { deleteUser } from './deleteUser';
import admin from '../../adminConfig.js';

jest.mock('firebase-functions', () => {
  class MockHttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  return {
    https: {
      onCall: jest.fn(),
      HttpsError: MockHttpsError,
    },
    logger: {
      info: jest.fn(),
    },
  }
});

jest.mock('../../adminConfig.js');
jest.spyOn(console, 'error').mockImplementation(() => {});
const mockBatchUpdate = jest.fn();
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn();
const mockBatch = {
  update: mockBatchUpdate,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
};
const mockGet = jest.fn();
const storageMock = {
  bucket: jest.fn().mockReturnThis(),
  file: jest.fn().mockReturnThis(),
  getFiles: jest.fn().mockResolvedValue([[]]),
  delete: jest.fn().mockResolvedValue(),
};
const authMock = {
  deleteUser: jest.fn().mockResolvedValue(),
};
admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  get: mockGet,
  batch: jest.fn().mockReturnValue(mockBatch),
  where: jest.fn().mockReturnThis(),
});
admin.firestore.FieldValue = {
  arrayRemove: () => { },
  increment: () => { },
}
admin.storage = jest.fn(() => storageMock);
admin.auth = jest.fn(() => authMock);

describe('deleteUser', () => {
  const context = {
    auth: {
      uid: 'testUserId',
    },
  };

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    mockGet.mockResolvedValueOnce([{
      ref: 'username ref'
    }])
    mockGet.mockResolvedValueOnce({
      docs: [{
        ref: 'product ref',
        data: () => ({
          purchaseDate: 'purchase date'
        })
      },
      {
        ref: {
          collection: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValueOnce([{
            ref: 'product comment ref',
            data: () => ({
              user: 'user who commented on product'
            })
          }]),
          test: 'product ref',
          listCollections: jest.fn().mockResolvedValue([])
        },
        data: () => ({
        })
      }]
    })
    mockGet.mockResolvedValueOnce([{
      ref: 'product like ref'
    }])
    mockGet.mockResolvedValueOnce([{
      ref: 'product notifications ref'
    }])

    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        comments: ['product id 1']
      })
    })
    mockGet.mockResolvedValueOnce([{
      ref: 'comment ref'
    }])
    mockGet.mockResolvedValueOnce([{
      ref: 'like ref'
    }])
    mockGet.mockResolvedValueOnce([{
      ref: 'follower ref'
    }])
    mockGet.mockResolvedValueOnce([{
      ref: 'following ref'
    }])
    mockGet.mockResolvedValueOnce([
      {
        ref: 'seller review ref',
        data: () => ({
          buyer: 'buyer id'
        }),
      }
    ])
    mockGet.mockResolvedValueOnce([
      {
        ref: 'buyer review ref',
      }
    ])
    mockGet.mockResolvedValueOnce([
      {
        empty: false,
        ref: 'notifications about the user 1',
        data: () => ({
          isRead: true
        })
      },
      {
        empty: false,
        ref: 'notifications about the user 2',
        data: () => ({
          isRead: false
        })
      },
    ])
    mockGet.mockResolvedValueOnce([
      {
        empty: false,
        ref: 'notifications for the user',
        data: () => ({
          isRead: true
        })
      }
    ])
    mockGet.mockResolvedValueOnce({
      exists: true,
      ref: {
        test: 'user ref',
        listCollections: jest.fn().mockResolvedValue([
          {
            get: jest.fn().mockResolvedValue([{
              ref: 'sub collection ref'
            }])
          }
        ])
      }
    })
  });

  it('should throw an error if the user is not authenticated', async () => {
    const unauthenticatedContext = {};
    const data = {};

    await expect(deleteUser(data, unauthenticatedContext)).rejects.toThrow(
      'You must be authenticated to delete your account.'
    );
  })

  it('should delete user data and return success message', async () => {
    const data = {};

    const result = await deleteUser(data, context);

    expect(result).toEqual({
      success: true,
      message: 'User account and related data deleted successfully.',
    });
  });

  it('should delete the profile image', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(storageMock.file).toHaveBeenCalledWith('images/profile/testUserId.jpg')
    expect(storageMock.delete).toHaveBeenCalledWith();
  });

  it('should delete the username', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).toHaveBeenCalledWith('username ref')
  });

  it('should delete the products that are not purchased', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).toHaveBeenCalledWith({
      test: 'product ref',
      get: expect.any(Function),
      listCollections: expect.any(Function),
      collection: expect.any(Function),
    })
  });

  it('should delete the comments', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).toHaveBeenCalledWith('comment ref')
  });

  it('should delete the likes', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).toHaveBeenCalledWith('like ref')
  });

  it('should delete the followers and followings', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).toHaveBeenCalledWith('follower ref')
    expect(mockBatchDelete).toHaveBeenCalledWith('following ref')
  });

  it('should delete the reviews received but not reviews given', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).not.toHaveBeenCalledWith('seller review ref')
    expect(mockBatchDelete).toHaveBeenCalledWith('buyer review ref')
  });

  it('should delete the user', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).toHaveBeenCalledWith({
      test: 'user ref',
      listCollections: expect.any(Function)
    })
  });

  it('should delete the users subcollections', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).toHaveBeenCalledWith('sub collection ref')
  });

  it('should delete the auth profile', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(authMock.deleteUser).toHaveBeenCalledWith('testUserId')
  });

  it('should commit the batch', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchCommit).toHaveBeenCalledWith();
  });

  it('should throw an error if the user is not authenticated', async () => {
    const data = {};
    jest.spyOn(console, 'error').mockImplementation(() => { })
    mockBatchCommit.mockRejectedValue(new Error('error'))

    await expect(deleteUser(data, context)).rejects.toThrow(
      "An error occurred while deleting the account. Please try again."
    );
  })
});