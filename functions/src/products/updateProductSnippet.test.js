import { updateProductSnippet } from './updateProductSnippet';
import admin from '../../adminConfig.js';
import { logger } from 'firebase-functions';

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

let mockGet = jest.fn().mockResolvedValue();
let mockUpdate = jest.fn()
let mockWhere = jest.fn().mockReturnThis();

jest.mock('../../adminConfig.js', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn().mockReturnThis(),
      get: mockGet,
      update: mockUpdate,
      where: mockWhere,
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    })),
  })),
}));

describe('updateProductSnippet', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update user product snippet successfully', async () => {
    const userId = 'testUserId';
    const products = [
      { id: '1', data: () => ({ mainImage: 'image1', purchaseDate: null }) },
      { id: '2', data: () => ({ mainImage: 'image2', purchaseDate: null }) },
      { id: '3', data: () => ({ mainImage: 'image3', purchaseDate: null }) },
      { id: '4', data: () => ({ mainImage: 'image4', purchaseDate: '2021-01-01' }) },
    ];
    mockGet.mockResolvedValueOnce({ docs: products });

    await updateProductSnippet(userId);

    expect(mockUpdate).toHaveBeenCalledWith({
      productSnippet: [
        { id: '1', mainImage: 'image1' },
        { id: '2', mainImage: 'image2' },
        { id: '3', mainImage: 'image3' },
      ],
    });
    expect(logger.info).toHaveBeenCalledWith('User product snippet updated successfully.');
  });

  it('should log an error if updating product snippet fails', async () => {
    const userId = 'testUserId';
    const errorMessage = 'Test error';
    mockGet.mockRejectedValue(new Error(errorMessage));

    await updateProductSnippet(userId);

    expect(logger.error).toHaveBeenCalledWith('Error updating product snippet:', errorMessage);
  });
});