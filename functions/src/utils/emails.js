import admin from '../../adminConfig.js';
import { logger } from 'firebase-functions';

export const emailTemplates = {
  USER_SIGN_UP: 'vywj2lp655q47oqz', //DONE
  BUYER_NEW_ORDER: '0r83ql3k3dp4zw1j', //DONE
  BUYER_SHIPPED: 'zr6ke4nm8mvgon12',  //DONE
  BUYER_DELIVERED: '351ndgw659n4zqx8',  //DONE
  BUYER_FAILED_PAYMENT: 'neqvygmmyx5g0p7w', // stripe webhoook
  SELLER_NEW_ORDER: 'jy7zpl9qvj545vx6', //DONE
  SELLER_SHIPPED: '3vz9dleq6q1lkj50',  //DONE
  SELLER_DELIVERED: 'ynrw7gykjkn42k8e',  //DONE
  SELLER_PAYMENT: 'pq3enl67rv5g2vwr',  //DONE
  SWAPSPOT_NEW_ORDER: 'z3m5jgrkr1oldpyo', //DONE
}

export const sendEmail = async ({ email, data, templateId }) => {
  if (email && data?.name) {
    logger.info(`Preparing to send email to: ${email}, with data: ${JSON.stringify(data)}`);
    try {
      await admin.firestore().collection('emails').add({
        to: [
          {
            email,
            name: data.name,
          }
        ],
        from: {
          email: 'no-reply@littleswaps.com',
          name: 'Little Swaps'
        },
        template_id: templateId,
        personalization: {
          data: {
            email,
            data,
          }
        }
      });

      logger.info(`Email document created successfully for: ${email}`);
      return 'Email document created successfully';
    } catch (error) {
      logger.error(`Error creating email document for: ${email}. Error: ${error.message}`, error);
      return 'Error creating email document';
    }
  } else {
    logger.error(`Invalid email data provided: ${JSON.stringify(data)}`);
    return 'Invalid email data';
  }
};