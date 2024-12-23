import admin from "../../adminConfig";
import { updateFollowCounts } from "./updateFollowCounts";
import { logger } from "firebase-functions";

const mockUpdate = jest.fn();
const mockGet = jest.fn().mockImplementation(() => ({
  data: () => ({
    followers: 10,
    following: 5,
  })
}));
jest.mock('../../adminConfig', () => ({
  firestore: () => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockGet,
        update: mockUpdate,
      })),
    })),
  }),
}));

describe('updateFollowCounts', () => {
  it('should update followers count', async () => {
    const userId = 'testUserId'
    const increment = 1;
    const isFollower = true;
    admin.firestore.FieldValue = {
      increment: jest.fn((value) => `increment(${value})`),
    };

    const result = await updateFollowCounts(userId, increment, isFollower);
    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({
      followers: "increment(1)",
    });
  });

  it('should update following count', async () => {
    const userId = 'testUserId'
    const increment = 1;
    const isFollower = false;
    admin.firestore.FieldValue = {
      increment: jest.fn((value) => `increment(${value})`),
    };

    await updateFollowCounts(userId, increment, isFollower);

    expect(mockUpdate).toHaveBeenCalledWith({
      following: "increment(1)",
    });
  });

  it('should handle errors', async () => {
    const userId = 'testUserId'
    jest.spyOn(logger, 'error').mockImplementation(() => { });
    admin.firestore.FieldValue = {
      increment: jest.fn((value) => `increment(${value})`),
    };
    mockUpdate.mockRejectedValue(new Error("Firestore error"));

    await expect(updateFollowCounts(userId, 1, true)).rejects.toThrowError('Firestore error');
  });
});
