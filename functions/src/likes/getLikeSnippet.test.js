import { getLikeSnippet } from "./getLikeSnippet";

jest.mock('../../adminConfig', () => ({
  firestore: () => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn().mockResolvedValueOnce({
              docs: [
                {
                  data: () => ({
                    user: 'userId',
                    username: 'testUser',
                    product: 'productId',
                  }),
                },
              ],
            }),
          })),
        })),
      })),
    })),
  }),
}));

describe('getLikeSnippet', () => {
  it('should get like snippets for the product', async () => {
    const result = await getLikeSnippet('productId');

    expect(result).toEqual([
      { id: 'userId_productId', user: 'userId', username: 'testUser' },
    ]);
  });
});
