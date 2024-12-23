// const admin = require('../../adminConfig');
import {getIdsFromEvent} from "./constants";

describe('Constants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getIdsFromUniqueId', () => {
    it('should extract user and document IDs from uniqueId', () => {
      const event = {
        params: {
          uniqueId: 'userId_documentId',
        },
      };

      const result = getIdsFromEvent(event, 'uniqueId');

      expect(result).toEqual({
        user: 'userId',
        document: 'documentId',
      });
    });
  });
});
