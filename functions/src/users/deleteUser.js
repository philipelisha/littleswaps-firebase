import { https, logger } from "firebase-functions";
import admin from '../../adminConfig.js';

export const deleteUser = async (data, context) => {
  if (!context.auth) {
    throw new https.HttpsError(
      "unauthenticated",
      "You must be authenticated to delete your account."
    );
  }

  const userId = context.auth.uid;
  const batch = admin.firestore().batch();
  const db = admin.firestore();

  try {
    logger.info('userId', userId);

    await deleteProfileImage(userId); // DONE
    await deleteUsername(db, userId, batch); // DONE
    await deleteProducts(db, batch, userId); // DONE
    await deleteComments(db, batch, userId); // DONE
    await deleteLikes(db, batch, userId); // DONE
    await deleteFollowersAndFollowings(db, batch, userId); // DONE
    await deleteReviews(db, batch, userId);
    await deleteUserDocument(db, userId, batch); // DONE
    await deleteUserAuthProfile(userId); // DONE

    // Commit all batched deletions
    await batch.commit();

    return {
      success: true,
      message: "User account and related data deleted successfully."
    };
  } catch (error) {
    console.error("Error deleting user account:", error);
    throw new https.HttpsError(
      "internal",
      "An error occurred while deleting the account. Please try again."
    );
  }
}

const deleteProfileImage = async (userId) => {
  const bucket = admin.storage().bucket();
  const profileImagePath = `images/profile/${userId}.jpg`;

  try {
    await bucket.file(profileImagePath).delete();
  } catch (error) {
    console.warn(`Profile image not found: ${error.message}`);
  }
};

const deleteUsername = async (db, userId, batch) => {
  const userNameSnapshot = await db.collection("usernames")
    .where('user', '==', userId)
    .get();

  userNameSnapshot.forEach((userNameDoc) => {
    batch.delete(userNameDoc.ref);
  });
};

const deleteProducts = async (db, batch, userId) => {
  const productsSnapshot = await db.collection("products")
    .where("user", "==", userId)
    .get();
  productsSnapshot.forEach(async (doc) => {
    const productData = doc.data();
    if (!productData.purchaseDate) {
      await deleteSubcollections(doc.ref, batch);
      batch.delete(doc.ref);
    }
  });
};

const deleteComments = async (db, batch, userId) => {
  const userDoc = await db.collection("users").doc(userId).get();
  if (userDoc.exists) {
    const userData = userDoc.data();
    if (userData.comments && Array.isArray(userData.comments)) {
      for (const productId of userData.comments) {
        const commentsRef = db.collection("products").doc(productId).collection("comments");
        const commentsSnapshot = await commentsRef.where("user", "==", userId).get();
        commentsSnapshot.forEach((commentDoc) => {
          batch.delete(commentDoc.ref);
        });
      }
    }
  }
};

const deleteLikes = async (db, batch, userId) => {
  const likesSnapshot = await db.collection("likes").where("user", "==", userId).get();
  likesSnapshot.forEach((likeDoc) => {
    batch.delete(likeDoc.ref);
  });
};

const deleteFollowersAndFollowings = async (db, batch, userId) => {
  const followersRef = db.collection("followers");
  const followerSnapshot = await followersRef.where("follower", "==", userId).get();
  const followingSnapshot = await followersRef.where("user", "==", userId).get();

  followerSnapshot.forEach((followerDoc) => {
    batch.delete(followerDoc.ref);
  });
  followingSnapshot.forEach((followingDoc) => {
    batch.delete(followingDoc.ref);
  });
};

const deleteReviews = async (db, batch, userId) => {
  const reviewsGivenSnapshot = await db.collection("users")
    .doc(userId)
    .collection("reviewsGiven")
    .get();
  const promises = [];

  reviewsGivenSnapshot.forEach((reviewDoc) => {
    const reviewData = reviewDoc.data();
    const sellerDoc = db.collection("users")
      .doc(reviewData.seller);

    const promise = sellerDoc.collection("reviews")
      .where("buyer", "==", userId)
      .get()
      .then((reviewsSnapshot) => {
        reviewsSnapshot.forEach((sellerReviewDoc) => {
          batch.delete(sellerReviewDoc.ref);
        });
      });
    promises.push(promise);
  });

  const reviewsSnapshot = await db.collection("users")
    .doc(userId)
    .collection("reviews")
    .get();
  reviewsSnapshot.forEach((reviewDoc) => {
    const reviewData = reviewDoc.data();
    const buyerDoc = db.collection("users")
      .doc(reviewData.buyer);

    const promise = buyerDoc.collection("reviewsGiven")
      .where("seller", "==", userId)
      .get()
      .then((reviewsGivenSnapshot) => {
        reviewsGivenSnapshot.forEach((buyerReviewDoc) => {
          batch.delete(buyerReviewDoc.ref);
        });
      });
    promises.push(promise);
  });

  await Promise.all(promises);
};

const deleteUserDocument = async (db, userId, batch) => {
  const userDoc = await db.collection("users")
  .doc(userId)
  .get();

  await deleteSubcollections(userDoc.ref, batch);

  if (userDoc.exists) {
    batch.delete(userDoc.ref);
  }
};

const deleteUserAuthProfile = async (userId) => {
  await admin.auth().deleteUser(userId);
};

const deleteSubcollections = async (docRef, batch) => {
  const collections = await docRef.listCollections();

  for (const collection of collections) {
    const subcollectionSnapshot = await collection.get();

    subcollectionSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
  }
};