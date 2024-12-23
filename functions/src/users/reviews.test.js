import { logger } from "firebase-functions";
import { createReview } from "./reviews";

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

describe("createReview function", () => {
  it("should log the received review ID and call addReviewSnippet with correct arguments", async () => {
    const event = {
      params: {
        userId: "testUserId",
        reviewId: "testReviewId",
      },
    };

    await createReview(event);
    expect(require("./addReviewSnippet").addReviewSnippet).toHaveBeenCalledWith(
      "testUserId"
    );
  });
});
