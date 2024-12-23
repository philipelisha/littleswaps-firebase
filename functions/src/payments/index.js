import { https, logger } from 'firebase-functions';
import stripe from "stripe";
import admin from '../../adminConfig.js';
import { Shippo } from "shippo";
import { orderActions } from '../../order.config.js';
import { onUpdateOrderStatus } from '../orders/index.js';

const stripeSDK = stripe(process.env.stripeKey)

const shippoSDK = new Shippo({ apiKeyHeader: process.env.shippoKey });

export const addCardToPaymentIntent = async (data, context, stripe = stripeSDK) => {
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
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.");
    }

    const { paymentIntentId } = data

    const confirmedIntent = await stripe.paymentIntents.confirm(
      paymentIntentId,
      { return_url: 'https://littleswaps.com' },
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
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const { email, user } = data;

  try {
    logger.info('Starting to create the stripe account')
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: email,
    });

    logger.info('New Stripe account Id: ' + account.id)


    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: 'https://littleswaps.com/user-balance?reauth=true&accountId=' + account.id,
      return_url: 'https://littleswaps.com/user-balance',
      type: 'account_onboarding',
    });

    await admin.firestore().collection('users').doc(user).update({
      stripeAccountId: account.id,
      stripeAccountLink: accountLink.url
    });

    logger.info('Finished creating the stripe account: ' + accountLink)

    return accountLink.url;
  } catch (error) {
    logger.error(JSON.stringify(error.message))
    console.error('Error creating Stripe account:', error);
    return false;
  }
};

export const getStripeBalance = async (data, context, stripe = stripeSDK) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const { accountId } = data;
  logger.info("accountId", accountId)

  try {
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId,
    });

    return balance;
  } catch (error) {
    logger.error(JSON.stringify(error.message))
    logger.error('Error getting Stripe balance:', error);
    return false;
  }
};

export const getLinkedAccounts = async (data, context, stripe = stripeSDK) => {
  logger.info("getLinkedAccounts")
  if (!context.auth) {
    logger.error("You must be authenticated to call this function.")
    throw new functions.https.HttpsError('unauthenticated', 'You must be authenticated to call this function.');
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
    logger.error(JSON.stringify(error.message))
    logger.error('Error getting Stripe linked accounts:', error);
    return false;
  }
}

export const createLoginLink = async (data, context, stripe = stripeSDK) => {
  logger.info("createLoginLink");

  if (!context.auth) {
    logger.error("You must be authenticated to call this function.");
    throw new functions.https.HttpsError('unauthenticated', 'You must be authenticated to call this function.');
  }

  const { accountId } = data;
  logger.info("accountId", accountId);

  try {
    const loginLink = await stripe.accounts.createLoginLink(accountId);

    return loginLink.url;
  } catch (error) {
    logger.error(JSON.stringify(error.message));
    logger.error('Error creating Stripe login link:', error);
    return false;
  }
};

export const createShipment = async (data, context, shippo = shippoSDK) => {
  logger.info('~~~~~~~~~~~~ START createShipment ~~~~~~~~~~~~')
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

export const createLabel = async (data, context, shippo = shippoSDK) => {
  logger.info('~~~~~~~~~~~~ START createLabel ~~~~~~~~~~~~')
  if (!context.auth) {
    throw new https.HttpsError("unauthenticated", "Authentication required.");
  }

  const { rateId, productId } = data;

  try {
    const transaction = await shippo.transactions.create({
      rate: rateId,
      label_file_type: "PDF",
      metadata: productId,
      labelFileType: 'PNG'
    });

    return transaction;
  } catch (error) {
    logger.error(JSON.stringify(error))
    return {
      success: false,
      message: error.message,
      status: 'failed'
    };
  }
};

export const saveShippingLabel = async (req, res) => {
  try {
    logger.info('Received webhook request', {
      body: req.body,
      query: req.query,
      headers: req.headers,
      env: process.env.token
    });

    const token = req.query['token'];
    if (!token || token !== process.env.token) {
      logger.warn('Invalid webhook token');
      return res.status(401).send('Unauthorized');
    }

    const {
      label_url,
      metadata,
      tracking_url_provider,
      tracking_number,
      status
    } = req.body.data;

    const productId = metadata;

    if (!productId || !label_url || status !== 'SUCCESS') {
      return res.status(400).json({
        success: false,
        message: 'Missing product ID or label URL.',
      });
    }

    const productsRef = admin.firestore().collection('products');
    await productsRef.doc(productId).update({
      shippingLabel: label_url,
      shippingUrl: tracking_url_provider,
      shippingNumber: tracking_number,
      shippingLabelCreating: false,
    });

    await onUpdateOrderStatus({
      type: orderActions.LABEL_CREATED,
      productId
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

export const orderTrackingUpdate = async (req, res) => {
  try {
    logger.info('Received webhook request', {
      body: req.body,
      query: req.query,
      headers: req.headers,
      env: process.env.token
    });

    const token = req.query['token'];
    if (!token || token !== process.env.token) {
      logger.warn('Invalid webhook token');
      return res.status(401).send('Unauthorized');
    }

    const { data, event } = req.body;
    const { metadata: productId, tracking_status } = data;
    if (!productId || !tracking_status) {
      return res.status(400).json({
        success: false,
        message: 'Missing productId or tracking status.',
      });
    }

    const { status, substatus } = tracking_status;

    const statusMapping = {
      package_accepted: orderActions.SHIPPED,
      outfordelivery: orderActions.OUT_FOR_DELIVERY,
      delivered: orderActions.DELIVERED,
    };

    const orderAction = statusMapping[substatus || status];
    if (!orderAction) {
      logger.warn('Unmapped status received:', status);
      return res.status(400).json({
        success: false,
        message: 'Unmapped tracking status received.',
      });
    }

    await onUpdateOrderStatus({ type: orderAction, productId });

    return res.status(200).send('Webhook received and logged');
  } catch (error) {
    logger.error('Error processing webhook', error);
    return res.status(500).send('Internal Server Error');
  }
}

export const failedPaymentIntent = async (req, res) => {
  const sig = request.headers['stripe-signature'];

  let event;

  try {
    event = stripeSDK.webhooks.constructEvent(req.body, sig, process.env.secret);
  } catch (error) {
    logger.error('Webhook Error: ', error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  switch (event.type) {
    case 'payment_intent.payment_failed':
    case 'payment_intent.requires_action':
      // const paymentIntentPaymentFailed = event.data.object;
      // const paymentIntentRequiresAction = event.data.object;
      logger.info('Got here: ', event.data);
      break;
    default:
      logger.error('Unhandled event type', event.type);
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return res.status(200).send('Suceeded');
}

export const getEstimatedTaxes = async (data, context) => {
  if (!context.auth) {
    logger.error("You must be authenticated to call this function.");
    throw new functions.https.HttpsError('unauthenticated', 'You must be authenticated to call this function.');
  }

  logger.info("getEstimatedTaxes data: ", data);

  const {
    shippingRateInCents,
    itemPriceInCents,
    taxableAddress,
    taxBehavior = 'exclusive',
  } = data;

  try {
    const taxCalculation = await stripeSDK.tax.calculations.create({
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