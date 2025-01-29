import { deleteUser } from './deleteUser';
import { https } from 'firebase-functions';
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
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn();
const mockBatch = {
  delete: mockBatchDelete,
  commit: mockBatchCommit,
};
const mockGet = jest.fn();
const storageMock = {
  bucket: jest.fn().mockReturnThis(),
  file: jest.fn().mockReturnThis(),
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
admin.storage = jest.fn(() => storageMock);
admin.auth = jest.fn(() => authMock);

describe('deleteUser', () => {
  const context = {
    auth: {
      uid: 'testUserId',
    },
  };

  /* beforeEach(async () => {
    mockGet.mockResolvedValueOnce([{
      ref: 'username ref'
    }])

    mockGet.mockResolvedValueOnce({
      docs: [
        {
          ref: 'product ref',
          data: () => ({
            purchaseDate: 'purchase date'
          })
        },
        {
          ref: {
            collection: jest.fn().mockReturnThis(),
            test: 'product ref',
            listCollections: jest.fn().mockResolvedValue([])
          },
          data: () => ({
            sellerId: 'testSellerId2',
            productId: 'testProductId2',
          })
        }]
    });

    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        comments: ['product id 1']
      }),
    });

    mockGet.mockResolvedValueOnce([{
      ref: 'comment ref'
    }]);
    mockGet.mockResolvedValueOnce([{
      ref: 'like ref'
    }]);
    mockGet.mockResolvedValueOnce([{
      ref: 'follower ref'
    }]);
    mockGet.mockResolvedValueOnce([{
      ref: 'following ref'
    }]);

    // Mock reviews
    mockGet.mockResolvedValueOnce([{
      data: () => ({}),
    }]);
    mockGet.mockResolvedValueOnce([{
      ref: 'seller review ref'
    }]);
    mockGet.mockResolvedValueOnce([{
      data: () => ({}),
    }]);
    mockGet.mockResolvedValueOnce([{
      ref: 'buyer review ref'
    }]);

    // Mock user's subcollections
    mockGet.mockResolvedValueOnce({
      exists: true,
      ref: {
        test: 'user ref',
        listCollections: jest.fn().mockResolvedValue([{
          get: jest.fn().mockResolvedValue([{
            ref: 'sub collection ref'
          }]),
        }]),
      },
    });

    // Mock additional product-related references for deleteProductReferences
    mockGet.mockResolvedValueOnce([{
      ref: 'product-related ref',
      data: () => ({
        relatedDataField: 'dummyValue',
      }),
    }]);

    mockGet.mockResolvedValueOnce([]);
  }); */

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
          test: 'product ref',
          listCollections: jest.fn().mockResolvedValue([])
        },
        data: () => ({
        })
      }]
    })
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
        data: () => ({})
      }
    ])
    mockGet.mockResolvedValueOnce([
      {
        ref: 'seller review ref'
      }
    ])
    mockGet.mockResolvedValueOnce([
      {
        data: () => ({})
      }
    ])

    mockGet.mockResolvedValueOnce([
      {
        ref: 'buyer review ref'
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

    expect(mockBatchDelete).toHaveBeenCalledWith('seller review ref')
    expect(mockBatchDelete).toHaveBeenCalledWith('buyer review ref')
  });

  it('should delete the reviews', async () => {
    const data = {};

    await deleteUser(data, context);

    expect(mockBatchDelete).toHaveBeenCalledWith('follower ref')
    expect(mockBatchDelete).toHaveBeenCalledWith('following ref')
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