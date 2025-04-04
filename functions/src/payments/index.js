import { https, logger } from 'firebase-functions';
import stripe from "stripe";
import admin from '../../adminConfig.js';
import { Shippo } from "shippo";
import { orderActions } from '../../order.config.js';
import axios from 'axios';
import { onUpdateOrderStatus } from '../orders/onUpdateOrderStatus.js';

const stripeSDK = stripe(process.env.stripeKey)
const shippoKey = process.env.shippoKey;
const envToken = process.env.token;
const shippoSDK = new Shippo({ apiKeyHeader: shippoKey });
const db = admin.firestore();

export const addCardToPaymentIntent = async (data, context, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START addCardToPaymentIntent ~~~~~~~~~~~~", data);
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.")
    }

    const { paymentIntentId, cardToken, customerId } = data

    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        token: cardToken,
      },
    })

    const card = await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: customerId,
    })

    await stripe.paymentIntents.update(paymentIntentId, {
      payment_method: card.id,
    });

    logger.info('Card added to payment intent successfully.');

    return {
      success: true,
      message: 'Card added to payment intent successfully.',
    }
  } catch (error) {
    logger.error(JSON.stringify(error))
    return {
      success: false,
      message: error.message,
      status: 'failed'
    };
  }
}

export const confirmPaymentIntent = async (data, context, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START confirmPaymentIntent ~~~~~~~~~~~~", data);
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.");
    }

    const { paymentIntentId } = data

    const confirmedIntent = await stripe.paymentIntents.confirm(
      paymentIntentId,
      { return_url: 'https://littleswaps.com/redirect?path=orders' },
    )

    logger.info('Confirming payment intent.', JSON.stringify(confirmedIntent))
    if (confirmedIntent.status === "succeeded") {
      return {
        success: true,
        message: 'Payment confirmed successfully.'
      }
    } else if (confirmedIntent.status === "requires_action") {
      return {
        success: false,
        message: "Additional authentication required.",
        requiresAction: true,
      };
    } else {
      return {
        success: false,
        message: "Payment confirmation failed.",
        status: confirmedIntent.status,
      };
    }
  } catch (error) {
    logger.error(JSON.stringify(error))
    return {
      success: false,
      message: error.message,
      status: 'failed'
    };
    // throw new https.HttpsError(
    //   error.message
    // )
  }
}

export const createStripeAccount = async (data, context, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START createStripeAccount ~~~~~~~~~~~~", data);
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'Authentication required.');
  }

  try {
    const { email, user } = data;
    logger.info('Starting to create the stripe account')
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: email,
    });

    logger.info('New Stripe account Id: ' + account.id)

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: 'https://littleswaps.com/redirect?path=user-balance&reauth=true&accountId=' + account.id,
      return_url: 'https://littleswaps.com/redirect?path=user-balance',
      type: 'account_onboarding',
    });

    await admin.firestore().collection('users').doc(user).update({
      stripeAccountId: account.id,
      stripeAccountLink: accountLink.url,
    });

    logger.info('Finished creating the stripe account: ' + accountLink)

    return accountLink.url;
  } catch (error) {
    logger.error(JSON.stringify(error.message))
    console.error('Error creating Stripe account:', error);
    return false;
  }
};

export const transferPendingPayouts = async (data, context, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START transferPendingPayouts ~~~~~~~~~~~~", data);
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const { user } = data;
  logger.info("user", user)

  try {
    const userDocRef = admin.firestore().collection('users').doc(user);
    const userDoc = await userDocRef.get();
    let userDocData;
    if (userDoc.exists) {
      userDocData = userDoc.data();
    }

    const pendingPayouts = userDocData.pendingPayouts || [];

    await Promise.all(pendingPayouts.map((payout) =>
      stripe.transfers.create({
        amount: payout.amount * 100,
        currency: payout.currency,
        destination: userDocData.stripeAccountId,
        source_transaction: payout.chargeId,
      })
    ));

    await userDocRef.update({
      pendingPayouts: []
    });

    return {
      message: 'success',
      data: true,
    };
  } catch (error) {
    logger.error('Error transfering balance: ', error.message);
    return {
      message: error.message,
      data: false,
    };
  }
}

export const getStripeBalance = async (data, context, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START getStripeBalance ~~~~~~~~~~~~", data);
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const { accountId } = data;
  logger.info("accountId", accountId)

  try {
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId,
    });

    return balance;
  } catch (error) {
    logger.error('Error getting Stripe balance:', error.message);
    return false;
  }
};

export const getLinkedAccounts = async (data, context, stripe = stripeSDK) => {
  if (!context.auth) {
    logger.error("You must be authenticated to call this function.")
    throw new https.HttpsError('unauthenticated', 'You must be authenticated to call this function.');
  }

  const { accountId } = data;
  logger.info("accountId", accountId)

  try {
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      accountId,
      {}
    );

    return externalAccounts.data;
  } catch (error) {
    logger.error('Error getting Stripe linked accounts:', error.message);
    return false;
  }
}

export const createLoginLink = async (data, context, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START createLoginLink ~~~~~~~~~~~~", data);

  if (!context.auth) {
    logger.error("You must be authenticated to call this function.");
    throw new https.HttpsError('unauthenticated', 'You must be authenticated to call this function.');
  }

  const { accountId } = data;
  logger.info("accountId", accountId);

  try {
    const loginLink = await stripe.accounts.createLoginLink(accountId);

    return loginLink.url;
  } catch (error) {
    logger.error('Error creating Stripe login link:', error.message);
    return false;
  }
};

export const getEstimatedTaxes = async (data, context, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START getEstimatedTaxes ~~~~~~~~~~~~", data);
  if (!context.auth) {
    logger.error("You must be authenticated to call this function.");
    throw new https.HttpsError('unauthenticated', 'You must be authenticated to call this function.');
  }

  logger.info("getEstimatedTaxes data: ", data);

  const {
    shippingRateInCents,
    itemPriceInCents,
    taxableAddress,
    taxBehavior = 'exclusive',
  } = data;

  try {
    const taxCalculation = await stripe.tax.calculations.create({
      currency: 'usd',
      shipping_cost: {
        amount: shippingRateInCents,
      },
      line_items: [
        {
          amount: itemPriceInCents,
          quantity: 1,
          reference: 'L1',
          tax_behavior: taxBehavior,
        },
      ],
      customer_details: {
        address: {
          line1: taxableAddress.street,
          city: taxableAddress.city,
          state: taxableAddress.state,
          postal_code: taxableAddress.zip,
          country: taxableAddress.country,
        },
        address_source: 'shipping',
      },
    });

    logger.info('Success getting the tax calc', taxCalculation);

    return {
      taxCalculationId: taxCalculation?.id,
      tax: parseFloat((taxCalculation?.tax_amount_exclusive / 100).toFixed(2))
    };
  } catch (error) {
    logger.error('Error estimating taxes:', error.message);
    return false;
  }
};

/* export const failedPaymentIntent = async (req, res, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START failedPaymentIntent ~~~~~~~~~~~~", {
    body: req.body,
    query: req.query,
    headers: req.headers,
    env: process.env.secret
  });
  const sig = request.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.secret);
  } catch (error) {
    logger.error('Webhook Error: ', error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  switch (event.type) {
    case 'payment_intent.payment_failed':
    case 'payment_intent.requires_action':
      logger.info('Got here: ', event.data);
      break;
    default:
      logger.error('Unhandled event type', event.type);
      console.log(`Unhandled event type ${event.type}`);
  }

  return res.status(200).send('Suceeded');
} */

export const createShipment = async (data, context, shippo = shippoSDK) => {
  logger.info('~~~~~~~~~~~~ START createShipment ~~~~~~~~~~~~', data)
  if (!context.auth) {
    logger.error('unauthenticated')
    throw new https.HttpsError("unauthenticated", "Authentication required.");
  }

  const { fromAddress, toAddress, parcel } = data;
  logger.info('the data: ', data)
  try {
    const shipment = await shippo.shipments.create({
      addressFrom: {
        ...fromAddress,
        street1: fromAddress.street
      },
      addressTo: {
        ...toAddress,
        street1: toAddress.street
      },
      parcels: [parcel],
      async: false,
      extra: {
        qr_code_requested: true,
      }
    });

    return shipment;
  } catch (error) {
    logger.error(JSON.stringify(error))
    return {
      success: false,
      message: error.message,
      status: 'failed'
    };
  }
};

export const createLabel = async ({ rateId, sellerId, salesId }, shippo = shippoSDK) => {
  logger.info('create label', { rateId, salesId, sellerId })

  try {
    await db.collection("users")
      .doc(sellerId)
      .collection('sales')
      .doc(salesId)
      .update({
        shippingLabelCreating: true
      });

    const transaction = await shippo.transactions.create({
      rate: rateId,
      label_file_type: "PNG",
      metadata: `${sellerId}_${salesId}`,
      labelFileType: 'PNG'
    });

    return transaction;
  } catch (error) {
    logger.error(JSON.stringify(error.message))
    return {
      success: false,
      message: error.message,
      status: 'failed'
    };
  }
};

export const validateAddress = async (data, context, key = shippoKey) => {
  logger.info("~~~~~~~~~~~~ START validateAddress ~~~~~~~~~~~~", data);
  logger.info("Shippo Key: ", key);

  if (!context.auth) {
    throw new https.HttpsError("unauthenticated", "Authentication required.");
  }

  const { street, street2, city, state, zip, country, name } = data;

  if (!key) {
    throw new https.HttpsError("failed-precondition", "Shippo API key not configured.");
  }

  const url = `https://api.goshippo.com/v2/addresses/validate?address_line_1=${encodeURIComponent(
    street
  )}&address_line_2=${encodeURIComponent(street2)}&city_locality=${encodeURIComponent(
    city
  )}&state_province=${encodeURIComponent(state)}&postal_code=${encodeURIComponent(
    zip
  )}&country_code=${encodeURIComponent(country)}&organization=${encodeURIComponent(
    name
  )}`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `ShippoToken ${key}`,
      },
    });

    logger.info('validateAddress response', response.data);

    return response.data;
  } catch (error) {
    logger.error(JSON.stringify(error.message));

    throw new https.HttpsError(
      "internal",
      "Failed to validate address",
      error.message
    );
  }
};

export const saveShippingLabel = async (req, res, token = envToken) => {
  try {
    logger.info("~~~~~~~~~~~~ START saveShippingLabel ~~~~~~~~~~~~", {
      body: req.body,
      query: req.query,
      headers: req.headers,
      env: process.env.token
    });

    const requestToken = req.query['token'];
    if (!requestToken || requestToken !== token) {
      logger.warn('Invalid webhook token');
      return res.status(401).send('Unauthorized');
    }

    const {
      label_url,
      metadata: userAndSaleId,
      tracking_url_provider,
      qr_code_url,
      tracking_number,
      status
    } = req.body.data;

    if (!userAndSaleId || !label_url || status !== 'SUCCESS') {
      return res.status(400).json({
        success: false,
        message: 'Missing sale ID or label URL.',
      });
    }
    const [userId, saleId] = userAndSaleId.split('_');

    const saleRef = db
      .collection('users')
      .doc(userId)
      .collection('sales');
    const saleDoc = saleRef.doc(saleId);
    await saleDoc.update({
      shippingLabel: qr_code_url || label_url,
      shippingUrl: tracking_url_provider,
      shippingNumber: tracking_number,
      shippingLabelCreating: false,
    });

    const saleSnap = await saleDoc.get();

    if (saleSnap.exists) {
      const saleData = saleSnap.data();
      const batch = db.batch();

      const productIds = saleData.productBundle?.length
        ? saleData.productBundle.map((p) => p.productId)
        : [saleData.product?.productId];

      productIds.forEach((productId) => {
        if (!productId) return;
        const productRef = db.collection('products').doc(productId);
        batch.update(productRef, { shippingNumber: tracking_number });
      });

      await batch.commit();
    }
    
    await onUpdateOrderStatus({
      type: orderActions.LABEL_CREATED,
      userAndSaleId
    });

    return res.status(200).json({
      success: true,
      message: 'Shipping label saved successfully.',
    });
  } catch (error) {
    console.error('saveShippingLabel error: ', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to save the label at this time, please try again.',
    });
  }
};

export const orderTrackingUpdate = async (req, res, token = envToken) => {
  try {
    logger.info("~~~~~~~~~~~~ START orderTrackingUpdate ~~~~~~~~~~~~", {
      body: req.body,
      query: req.query,
      headers: req.headers,
      env: process.env.token
    });

    const requestToken = req.query['token'];
    if (!requestToken || requestToken !== token) {
      logger.warn('Invalid webhook token');
      return res.status(401).send('Unauthorized');
    }

    let { metadata: userAndSaleId, tracking_status, tracking_number } = req.body.data;
    if (!tracking_status) {
      logger.warn('No Tracking Status Provided');
      return res.status(400).json({
        success: false,
        message: 'Missing tracking status.',
      });
    }

    if (!userAndSaleId) {
      logger.warn('No Meta Data Provided, looking up by tracking number: ', tracking_number)
      const productSnapshot = await db
        .collection('products')
        .where('shippingNumber', '==', tracking_number)
        .get();
      if (!productSnapshot.empty) {
        const product = productSnapshot.docs[0].data();
        userAndSaleId = `${product.user}_${product.salesId}`;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Product not found for the given tracking number.',
        });
      }
    }

    const { status, substatus } = tracking_status;

    const statusMapping = {
      TRANSIT: orderActions.SHIPPED,
      PACKAGE_ACCEPTED: orderActions.SHIPPED,
      OUTFORDELIVERY: orderActions.OUT_FOR_DELIVERY,
      'OUT FOR DELIVERY': orderActions.OUT_FOR_DELIVERY,
      DELIVERED: orderActions.DELIVERED,
    };

    const statusKey = (substatus?.code || status || '').toUpperCase();
    const orderAction = statusMapping[statusKey];
    if (!orderAction) {
      logger.warn('Unmapped status received:', status);
      return res.status(400).json({
        success: false,
        message: 'Unmapped tracking status received.',
      });
    }

    await onUpdateOrderStatus({ type: orderAction, userAndSaleId });

    return res.status(200).send('Webhook received and logged');
  } catch (error) {
    logger.error('Error processing webhook', error);
    return res.status(500).send('Internal Server Error');
  }
}

export { dailyShippingReminder } from './dailyShippingReminder.js';