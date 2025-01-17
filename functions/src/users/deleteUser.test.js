import { deleteUser } from './deleteUser';

describe('deleteUser', () => {
  const context = {
    auth: {
      uid: 'testUserId',
    },
  };

  it('should throw an error if the user is not authenticated', async () => {
    const unauthenticatedContext = {};
    const data = {};

    await expect(deleteUser(data, unauthenticatedContext)).rejects.toThrow(
      'You must be authenticated to delete your account.'
    );
  })
});

// import { https } from 'firebase-functions';
// import admin from '../../adminConfig.js';

// jest.mock('firebase-functions', () => ({
//   https: {
//     HttpsError: jest.fn(),
//   },
//   logger: {
//     info: jest.fn(),
//   },
// }));

// jest.mock('../../adminConfig.js', () => ({
//   firestore: jest.fn().mockReturnValue({
//     batch: jest.fn().mockReturnValue({
//       delete: jest.fn(),
//       commit: jest.fn(),
//     }),
//     collection: jest.fn().mockReturnValue({
//       doc: jest.fn().mockReturnValue({
//         get: jest.fn().mockResolvedValue({
//           exists: true,
//           data: jest.fn().mockReturnValue({
//             comments: ['productId1', 'productId2'],
//           }),
//           ref: {
//             delete: jest.fn(),
//           },
//         }),
//         collection: jest.fn().mockReturnValue({
//           where: jest.fn().mockReturnValue({
//             get: jest.fn().mockResolvedValue({
//               forEach: jest.fn((callback) => {
//                 callback({
//                   ref: {
//                     delete: jest.fn(),
//                   },
//                 });
//               }),
//             }),
//           }),
//         }),
//       }),
//       where: jest.fn().mockReturnValue({
//         get: jest.fn().mockResolvedValue({
//           forEach: jest.fn((callback) => {
//             callback({
//               ref: {
//                 delete: jest.fn(),
//               },
//               data: jest.fn().mockReturnValue({
//                 purchaseDate: null,
//                 seller: 'sellerId',
//                 buyer: 'buyerId',
//               }),
//             });
//           }),
//         }),
//       }),
//     }),
//   }),
//   storage: jest.fn().mockReturnValue({
//     bucket: jest.fn().mockReturnValue({
//       file: jest.fn().mockReturnValue({
//         delete: jest.fn().mockResolvedValue(),
//       }),
//     }),
//   }),
//   auth: jest.fn().mockReturnValue({
//     deleteUser: jest.fn().mockResolvedValue(),
//   }),
// }));

// describe('deleteUser', () => {
//   const context = {
//     auth: {
//       uid: 'testUserId',
//     },
//   };

//   it('should throw an error if the user is not authenticated', async () => {
//     const unauthenticatedContext = {};
//     const data = {};

//     await expect(deleteUser(data, unauthenticatedContext)).rejects.toThrow(
//       new https.HttpsError(
//         'unauthenticated',
//         'You must be authenticated to delete your account.'
//       )
//     );
//   });

//   it('should delete user data and return success message', async () => {
//     const data = {};

//     const result = await deleteUser(data, context);

//     expect(result).toEqual({
//       success: true,
//       message: 'User account and related data deleted successfully.',
//     });
//   });

//   it('should handle errors during user deletion', async () => {
//     const data = {};
//     const error = new Error('Test error');
//     admin.firestore().batch().commit.mockRejectedValueOnce(error);

//     await expect(deleteUser(data, context)).rejects.toThrow(
//       new https.HttpsError(
//         'internal',
//         'An error occurred while deleting the account. Please try again.'
//       )
//     );
//   });
// });