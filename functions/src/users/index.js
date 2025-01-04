import { logger } from "firebase-functions";
import admin from '../../adminConfig.js';
import { emailTemplates, sendEmail } from "../utils/index.js";

export const defaultProfileImage = 'https://firebasestorage.googleapis.com/v0/b/babalu-476f1.appspot.com/o/app%2Fprofile%2FdefaultProfileImage.png?alt=media';

export const createUser = async (event) => {
  try {
    const userId = event.params.userId;
    const userDoc = await admin
      .firestore()
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
    beforeData.username !== afterData.username
  ) {
    await syncComments(afterData);
    await syncLikes(userId, afterData);
    await syncFollowers(userId, afterData);
    await syncReviews(userId, afterData);
  }
}

const syncComments = async (user) => {
  if (user.comments && Array.isArray(user.comments)) {
    for (const productId of user.comments) {
      const commentsRef = admin
        .firestore()
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
  const likesSnapshot = await admin
    .firestore()
    .collection('likes')
    .where('user', '==', userId)
    .get();

  if (!likesSnapshot.empty) {
    const batch = admin.firestore().batch();
    likesSnapshot.forEach((likeDoc) => {
      batch.update(likeDoc.ref, {
        userImage: user.profileImage || defaultProfileImage,
        username: user.username || '',
      });
    });

    await batch.commit();
  }
};

const syncFollowers = async (userId, user) => {
  const followersRef = admin.firestore().collection('followers');
  const batch = admin.firestore().batch();

  const followerSnapshot = await followersRef.where('follower', '==', userId).get();
  followerSnapshot.forEach((doc) => {
    batch.update(doc.ref, {
      followerImage: user.profileImage || defaultProfileImage,
      followerName: user.username || '',
    });
  });

  const followingSnapshot = await followersRef.where('user', '==', userId).get();
  followingSnapshot.forEach((doc) => {
    batch.update(doc.ref, {
      userImage: user.profileImage || defaultProfileImage,
      username: user.username || '',
    });
  });

  if (!followerSnapshot.empty || !followingSnapshot.empty) {
    await batch.commit();
  }
};

const syncReviews = async (userId, user) => {
  const batch = admin.firestore().batch();
  const userDoc = admin.firestore().collection('users').doc(userId);

  const promises = [];

  const reviewsGivenSnapshot = await userDoc.collection('reviewsGiven').get();
  reviewsGivenSnapshot.forEach((reviewDoc) => {
    const reviewData = reviewDoc.data();
    const sellerDoc = admin.firestore().collection('users').doc(reviewData.seller);

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
    const buyerDoc = admin.firestore().collection('users').doc(reviewData.buyer);

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

