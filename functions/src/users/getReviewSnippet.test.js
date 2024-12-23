import admin from '../../adminConfig';
import { getReviewSnippet } from "./getReviewSnippet";

jest.mock('../../adminConfig', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn(() => ({
                docs: [
                  { data: () => ({ reviewId: '1', comment: 'Great product' }) },
                  { data: () => ({ reviewId: '2', comment: 'Excellent service' }) },
                  { data: () => ({ reviewId: '3', comment: 'Fast delivery' }) },
                ],
              })),
            })),
          })),
        })),
      })),
    })),
  })),
}));

describe("getReviewSnippet", () => {
  it("should return an array of review data", async () => {
    const userId = 'testUserId';
    const result = await getReviewSnippet(userId);

    // expect(admin.firestore().collection().doc).toHaveBeenCalledWith(userId);
    // expect(admin.firestore().collection().doc().collection().orderBy().limit().get).toHaveBeenCalled();

    expect(result).toEqual([
      { reviewId: '1', comment: 'Great product' },
      { reviewId: '2', comment: 'Excellent service' },
      { reviewId: '3', comment: 'Fast delivery' },
    ]);
  });
});
