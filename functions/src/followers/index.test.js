import { logger } from "firebase-functions";
import {createFollower, deleteFollower} from ".";
import {updateFollowCounts} from "./updateFollowCounts";

jest.mock("./updateFollowCounts", () => ({
  updateFollowCounts: jest.fn(),
}));
jest.mock("../utils", () => ({
  getIdsFromEvent: jest.fn(() => {
    return {document: "docId", user: "userId" }
  }),
}));
jest.spyOn(logger, 'info').mockImplementation(() => {});

describe('Follower Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createFollower function', async () => {
    const event = {
      params: {},
    };

    await createFollower(event);

    expect(updateFollowCounts).toHaveBeenCalledWith('userId', 1);
    expect(updateFollowCounts).toHaveBeenCalledWith('docId', 1, true);
  });

  it('deleteFollower function', async () => {
    const event = {
      params: {},
    };
    await deleteFollower(event);

    expect(updateFollowCounts).toHaveBeenCalledWith('userId', -1);
    expect(updateFollowCounts).toHaveBeenCalledWith('docId', -1, true);
  });
});
