import {createLike, deleteLike} from "./";
import {updateProductLike} from "./updateProductLike";

jest.mock("./updateProductLike", () => ({
  updateProductLike: jest.fn(),
}))

jest.mock("../utils", () => ({
  getIdsFromEvent: jest.fn(() => {
    return {document: "docId", user: "userId" }
  }),
}));

describe('Like Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createLike function', async () => {
    const event = {
      params: {},
    };

    await createLike(event);

    expect(updateProductLike).toHaveBeenCalledWith('docId', true);
  });

  it('deleteLike function', async () => {
    const event = {
      params: {},
    };
    await deleteLike(event);

    expect(updateProductLike).toHaveBeenCalledWith('docId');
  });
});
