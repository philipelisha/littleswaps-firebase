import { logger } from "firebase-functions";
import admin from '../../adminConfig.js';
import { emailTemplates, sendEmail } from "../utils/index.js";

export const defaultProfileImage = 'https://firebasestorage.googleapis.com/v0/b/babalu-476f1.appspot.com/o/app%2Fprofile%2FdefaultProfileImage.png?alt=media';

export const createUser = async (event) => {
  const db = admin.firestore();
  logger.info("~~~~~~~~~~~~ START createUser ~~~~~~~~~~~~", event);
  try {
    const userId = event.params.userId;
    const userDoc = await db
      .collection("users")
      .doc(userId)
      .get();
    const data = userDoc.data();

    if (data.email) {
      await sendEmail({
        email: data.email,
        templateId: emailTemplates.USER_SIGN_UP,
        data: {
          name: `${data.firstName} ${data.lastName}`,
          firstName: data.firstName,
        },
      });
    }
  } catch (error) {
    logger.error('Problem sending the welcome email: ', error.message);
  }
};

export const updateUser = async (event) => {
  logger.info("~~~~~~~~~~~~ START updateUser ~~~~~~~~~~~~", event);
  try {
    const userId = event.params.userId;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    logger.info('beforeData', beforeData);
    logger.info('afterData', afterData);
    await handleEmailAddition(beforeData, afterData);
    await handleUserValueUpdates({ beforeData, afterData, userId });
  } catch (error) {
    logger.error('Problem updating user info: ', error.message);
  }
};

const handleEmailAddition = async (beforeData, afterData) => {
  if (!beforeData.email && afterData.email) {
    await sendEmail({
      email: afterData.email,
      templateId: emailTemplates.USER_SIGN_UP,
      data: {
        name: `${afterData.firstName} ${afterData.lastName}`,
        firstName: afterData.firstName,
      },
    });
  }
};

const handleUserValueUpdates = async ({ beforeData, afterData, userId }) => {
  if (
    beforeData.profileImage !== afterData.profileImage ||
    beforeData.username !== afterData.username ||
    beforeData.firstName !== afterData.firstName ||
    beforeData.lastName !== afterData.lastName
  ) {
    await syncComments(afterData);
    await syncLikes(userId, afterData);
    await syncLikesGiven(userId, afterData);
    await syncProducts(userId, afterData);
    await syncFollowers(userId, afterData);
    await syncReviews(userId, afterData);
    await syncNotifications(userId, afterData);
    await syncCarts(userId, afterData);
  }
}

const syncComments = async (user) => {
  const db = admin.firestore();
  if (user.comments && Array.isArray(user.comments)) {
    for (const productId of user.comments) {
      const commentsRef = db
        .collection('products')
        .doc(productId)
        .collection('comments');
      const commentsSnapshot = await commentsRef
        .where('user', '==', user.id)
        .get();

      commentsSnapshot.forEach(async (doc) => {
        await doc.ref.update({
          userImage: user.profileImage || defaultProfileImage,
          username: user.username || '',
        });
      });
    }
  }
};

const syncLikes = async (userId, user) => {
  const db = admin.firestore();
  const likesSnapshot = await db
    .collection('likes')
    .where('user', '==', userId)
    .get();

  if (!likesSnapshot.empty) {
    const batch = db.batch();
    likesSnapshot.forEach((likeDoc) => {
      batch.update(likeDoc.ref, {
        userImage: user.profileImage || defaultProfileImage,
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
      });
    });

    await batch.commit();
  }
};

const syncLikesGiven = async (userId, user) => {
  const db = admin.firestore();
  const likesSnapshot = await db
    .collection('likes')
    .where('seller', '==', userId)
    .get();

  if (!likesSnapshot.empty) {
    const batch = db.batch();
    likesSnapshot.forEach((likeDoc) => {
      batch.update(likeDoc.ref, {
        sellerUsername: user.username || '',
      });
    });

    await batch.commit();
  }
};

const syncProducts = async (userId, user) => {
  const db = admin.firestore();
  const productSnapshot = await db
    .collection('products')
    .where('user', '==', userId)
    .get();

  if (!productSnapshot.empty) {
    const batch = db.batch();
    productSnapshot.forEach((likeDoc) => {
      batch.update(likeDoc.ref, {
        username: user.username || '',
      });
    });

    await batch.commit();
  }
};

const syncNotifications = async (userId, user) => {
  const db = admin.firestore();
  const notificationSnapshot = await db
    .collection("notifications")
    .where("userId", "==", userId)
    .get();

  const batch = db.batch();
  notificationSnapshot.forEach((doc) => {
    const notificationRef = doc.ref;
    batch.update(notificationRef, {
      ...(doc.data().type === 'new_follower' && { imageUrl: user.profileImage }),
      "userSnapshot.username": user.username,
    });
  });

  await batch.commit();
};

const syncFollowers = async (userId, user) => {
  const db = admin.firestore();
  const followersRef = db.collection('followers');
  const batch = db.batch();

  const followerSnapshot = await followersRef.where('follower', '==', userId).get();
  followerSnapshot.forEach((doc) => {
    batch.update(doc.ref, {
      followerImage: user.profileImage || defaultProfileImage,
      followerName: user.username || '',
      followerFirstName: user.firstName || '',
      followerLastName: user.lastName || '',
    });
  });

  const followingSnapshot = await followersRef.where('user', '==', userId).get();
  followingSnapshot.forEach((doc) => {
    batch.update(doc.ref, {
      userImage: user.profileImage || defaultProfileImage,
      username: user.username || '',
      userFirstName: user.firstName || '',
      userLastName: user.lastName || '',
    });
  });

  if (!followerSnapshot.empty || !followingSnapshot.empty) {
    await batch.commit();
  }
};

const syncReviews = async (userId, user) => {
  const db = admin.firestore();
  const batch = db.batch();
  const userDoc = db.collection('users').doc(userId);

  const promises = [];

  const reviewsGivenSnapshot = await userDoc.collection('reviewsGiven').get();
  reviewsGivenSnapshot.forEach((reviewDoc) => {
    const reviewData = reviewDoc.data();
    const sellerDoc = db.collection('users').doc(reviewData.seller);

    const promise = sellerDoc
      .collection('reviews')
      .where('buyer', '==', userId)
      .get()
      .then((reviewsSnapshot) => {
        reviewsSnapshot.forEach((sellerReviewDoc) => {
          batch.update(sellerReviewDoc.ref, {
            buyerUserImage: user.profileImage || defaultProfileImage,
            buyerUsername: user.username || '',
          });
        });
      });
    promises.push(promise);
  });

  const reviewsSnapshot = await userDoc.collection('reviews').get();
  reviewsSnapshot.forEach((reviewDoc) => {
    const reviewData = reviewDoc.data();
    const buyerDoc = db.collection('users').doc(reviewData.buyer);

    const promise = buyerDoc
      .collection('reviewsGiven')
      .where('seller', '==', userId)
      .get()
      .then((reviewsGivenSnapshot) => {
        reviewsGivenSnapshot.forEach((sellerReviewDoc) => {
          batch.update(sellerReviewDoc.ref, {
            sellerUserImage: user.profileImage || defaultProfileImage,
            sellerUsername: user.username || '',
          });
        });
      });
    promises.push(promise);
  });

  await Promise.all(promises);

  await batch.commit();
};

const syncCarts = async (sellerId, sellerData) => {
  const db = admin.firestore();
  try {
    const cartSnapshot = await db
      .collection("carts")
      .where("sellerIds", "array-contains", sellerId)
      .get();

    if (cartSnapshot.empty) return;

    const batch = db.batch();

    cartSnapshot.forEach((doc) => {
      const cartRef = doc.ref;
      const cartData = doc.data();

      const updatedSellers = cartData.sellers.map((seller) => {
        if (seller.sellerId === sellerId) {
          return {
            ...seller,
            username: sellerData.username || '',
            profileImage: sellerData.profileImage || defaultProfileImage,
          };
        }
        return seller;
      });

      batch.update(cartRef, { sellers: updatedSellers });
    });

    await batch.commit();
  } catch (error) {
    console.error("Error syncing seller info in carts: ", error);
  }
};

export { deleteUser } from './deleteUser.js';