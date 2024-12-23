import admin from '../../adminConfig';
import { logger } from 'firebase-functions';
import { updateUsersListingCounts } from './updateUsersListingCounts';

const mockUpdate = jest.fn();
const mockGet = jest.fn();
jest.mock('../../adminConfig', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        update: mockUpdate,
        get: mockGet,
      })),
    })),
  })),
}));

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe.only('updateUsersListingCounts', () => {
  beforeEach(async () => {
    admin.firestore.FieldValue = {
      increment: jest.fn((value) => `increment(${value})`),
    };
  });

  it('should increment totalListings for new listings', async () => {
    await updateUsersListingCounts('user123', { isNew: true });
    expect(mockUpdate).toHaveBeenCalledWith({ totalListings: "increment(1)" })
    expect(logger.info).toHaveBeenCalledWith(
      'Updating the user listing counts to: ',
      "{\"totalListings\":\"increment(1)\"}"
    );
  });

  it('should increment totalSold for sold listings', async () => {
    await updateUsersListingCounts('user123', { isSold: true });

    expect(mockUpdate).toHaveBeenCalledWith({
      totalSold: "increment(1)",
    });
  });

  it('should increment or decrement totalActive based on isActive and updatingActive', async () => {
    await updateUsersListingCounts('user123', { updatingActive: true, isActive: true });

    expect(mockUpdate).toHaveBeenCalledWith({
      totalActive: "increment(1)",
    });
  });

  it('should decrement totalActive if isActive is false', async () => {
    await updateUsersListingCounts('user123', { updatingActive: true, isActive: false });

    expect(mockUpdate).toHaveBeenCalledWith({
      totalActive: "increment(-1)",
    });
  });

  it('should log if no updates are needed', async () => {
    await updateUsersListingCounts('user123', {});

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'No updates needed for user listing counts.'
    );
  });

  it('should handle non-existent documents after update', async () => {
    mockGet.mockImplementation(() => ({exists: false}))
    await updateUsersListingCounts('user123', { isNew: true });

    expect(logger.warn).toHaveBeenCalledWith('Document does not exist after update.');
  });

  it('should log error if update fails', async () => {
    const error = new Error('Firestore update failed');
    mockUpdate.mockRejectedValue(error);

    await updateUsersListingCounts('user123', { isNew: true });

    expect(logger.error).toHaveBeenCalledWith(
      'Error updating user listing counts:',
      error
    );
  });
});
