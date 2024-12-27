import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} from 'firebase-functions/v2/firestore';
import { https } from "firebase-functions";
import * as followers from "./src/followers/index.js";
import * as likes from "./src/likes/index.js";
import * as products from './src/products/index.js';
import * as users from "./src/users/index.js";
import * as reviews from "./src/users/reviews.js";
import * as payments from './src/payments/index.js';
import * as orders from './src/orders/index.js';

// firestore
export const createUser = onDocumentCreated('/users/{userId}', users.createUser);
export const updateUser = onDocumentUpdated('/users/{userId}', users.updateUser);
export const createReview = onDocumentCreated('/users/{userId}/reviews/{reviewId}', reviews.createReview);
export const createOrder = onDocumentCreated('/users/{userId}/orders/{orderId}', orders.createOrder);
export const createProduct = onDocumentCreated('/products/{productId}', products.createProduct);
export const updateProduct = onDocumentUpdated('/products/{productId}', products.updateProduct);
export const deleteProduct = onDocumentDeleted('/products/{productId}', products.deleteProduct);
export const shareProduct = https.onCall(products.onShare);
export const searchProducts = https.onCall(products.searchProducts);
export const createLike = onDocumentCreated('/likes/{likeId}', likes.createLike);
export const deleteLike = onDocumentDeleted('/likes/{likeId}', likes.deleteLike);
export const createFollower = onDocumentCreated('/followers/{followerId}', followers.createFollower);
export const deleteFollower = onDocumentDeleted('/followers/{followerId}', followers.deleteFollower);
export const updateOrderStatus = https.onCall(orders.updateOrderStatus);

//stripe
export const addCardToPaymentIntent = https.onCall(payments.addCardToPaymentIntent);
export const confirmPaymentIntent = https.onCall(payments.confirmPaymentIntent);
export const createStripeAccount = https.onCall(payments.createStripeAccount);
export const getStripeBalance = https.onCall(payments.getStripeBalance);
export const getLinkedAccounts = https.onCall(payments.getLinkedAccounts);
export const createLoginLink = https.onCall(payments.createLoginLink);
export const getEstimatedTaxes = https.onCall(payments.getEstimatedTaxes);
export const failedPaymentIntent = https.onRequest(payments.failedPaymentIntent);

//shippo
export const validateAddress = https.onCall(payments.validateAddress);
export const createShipment = https.onCall(payments.createShipment);
export const createLabel = https.onCall(payments.createLabel); 
export const saveShippingLabel = https.onRequest(payments.saveShippingLabel);
export const orderTrackingUpdate = https.onRequest(payments.orderTrackingUpdate);