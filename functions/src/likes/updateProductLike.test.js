import admin from '../../adminConfig';
import { updateProductLike } from './updateProductLike';
import { logger } from "firebase-functions";

jest.mock('./getLikeSnippet', () => ({
  getLikeSnippet: jest
      .fn()
      .mockResolvedValue([
        { id: 'userId_documentId', user: 'userId', username: 'testUser' },
      ]),
}));

const mockUpdate = jest.fn();
jest.mock('../../adminConfig', () => {
  const admin = {
    firestore: () => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          update: mockUpdate,
        })),
      })),
    }),
  };
  admin.firestore.FieldValue = {
    increment: jest.fn((val) => val),
  };
  return {
    ...admin,
  }
})

describe('updateProductLike', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update product likes and likeSnippet for adding like', async () => {
    const document = 'documentId'
    const isAdding = true;

    const result = await updateProductLike(document, isAdding);
    expect(result).toBe(null);

    expect(mockUpdate).toHaveBeenCalledWith({
      likes: 1,
      likeSnippet: [
        { id: 'userId_documentId', user: 'userId', username: 'testUser' },
      ],
    });
  });

  it('should update product likes and likeSnippet for removing like', async () => {
    const document = 'documentId'
    const isAdding = false;

    await updateProductLike(document, isAdding);

    expect(mockUpdate).toHaveBeenCalledWith({
      likes: admin.firestore.FieldValue.increment(-1),
      likeSnippet: [
        { id: 'userId_documentId', user: 'userId', username: 'testUser' },
      ],
    });
  });

  it('should handle errors during update', async () => {
    const document = 'documentId'
    const isAdding = true;
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    mockUpdate.mockRejectedValue(new Error("Firestore error"));
    
    await expect(updateProductLike(document, isAdding)).rejects.toThrowError("Firestore error");
  });
});
