import { logger } from "firebase-functions";
import { createReview } from "./reviews";
import admin from '../../adminConfig.js';

jest.mock('../../adminConfig.js');
jest.mock("./addReviewSnippet", () => ({
  addReviewSnippet: jest.fn(),
}));

jest.mock("firebase-functions", () => ({
  ...jest.requireActual("firebase-functions"),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))
const mockGet = jest.fn();
admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  get: mockGet,
  update: jest.fn().mockReturnThis(),
});
admin.firestore.FieldValue = {
  increment: jest.fn(),
};
describe("createReview function", () => {
  beforeEach(async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        reviews: []
      })
    })
  });
  it("should log the received review ID and call addReviewSnippet with correct arguments", async () => {
    const event = {
      params: {
        userId: "testUserId",
        reviewId: "testReviewId",
      },
      data: {
        data: () => ({
          rating: 5
        })
      }
    };

    await createReview(event);
    expect(require("./addReviewSnippet").addReviewSnippet).toHaveBeenCalledWith(
      "testUserId"
    );
  });
});
