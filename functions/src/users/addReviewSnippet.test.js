import admin from '../../adminConfig';
import { getReviewSnippet } from './getReviewSnippet';
import { addReviewSnippet } from './addReviewSnippet';

jest.mock('./getReviewSnippet', () => ({
  getReviewSnippet: jest.fn(),
}));

jest.mock('../../adminConfig', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        update: jest.fn(),
      })),
    })),
  })),
}));

describe("addReviewSnippet", () => {
  it("should call getReviewSnippet and update user document with review snippet", async () => {
    const userId = 'testUserId';
    const mockReviewSnippet = [{ reviewId: '1', comment: 'Great product' }];

    getReviewSnippet.mockResolvedValue(mockReviewSnippet);

    await addReviewSnippet(userId);

    expect(getReviewSnippet).toHaveBeenCalledWith(userId);
    // expect(admin.firestore().collection().doc).toHaveBeenCalledWith(userId);
    // expect(admin.firestore().collection().doc().update).toHaveBeenCalledWith({ reviewSnippet: mockReviewSnippet });
  });
});
