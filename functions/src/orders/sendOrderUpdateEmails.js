import { format } from "date-fns"
import { emailTemplates, sendEmail } from "../utils/index.js"

export const sendShippedEmails = async ({
  buyer,
  seller,
  product,
  order,
  address
}) => {
  await sendEmail({
    email: seller.email,
    templateId: emailTemplates.SELLER_SHIPPED,
    data: {
      name: seller.firstName + ' ' + seller.lastName,
      product: [
        {
          name: product.title,
          tracking: product.shippingNumber,
          order_number: order.product.slice(0, 6),
          delivery_method: order.shippingCarrier
        }
      ],
      firstName: seller.firstName
    }
  })

  await sendEmail({
    email: buyer.email,
    templateId: emailTemplates.BUYER_SHIPPED,
    data: {
      name: buyer.firstName + ' ' + buyer.lastName,
      order: {
        total: order.purchasePriceDetails.total,
        subtotal: product.price,
        order_number: order.id.slice(0, 6),
        order_number_full: order.id,
        shipping_day: format(new Date(), 'MM/dd/yyyy'),
        delivery_method: order.shippingCarrier,
        tracking_number: product.shippingNumber,
        delivery_method_fee: order.purchasePriceDetails.shippingRate
      },
      product: [
        {
          name: product.title,
          size: product.size,
          color: product.colors.join(', '),
          price: product.price
        }
      ],
      customer: {
        name: address.name,
        address_1st_line: `${address.street} ${address.street2}`,
        address_2nd_line: `${address.city}, ${address.state} ${address.zip}`
      },
      firstName: buyer.firstName
    }
  })
}

export const sendDeliveredEmails = async ({
  product,
  order,
  seller,
  buyer,
}) => {
  const today = format(new Date(), 'MM/dd/yyyy');
  await sendEmail({
    email: seller.email,
    templateId: emailTemplates.SELLER_DELIVERED,
    data: {
      name: seller.firstName + ' ' + seller.lastName,
      product: [
        {
          name: product.title,
          arrival_date: today,
          order_number: order.product.slice(0, 6)
        }
      ],
      firstName: seller.firstName
    }
  })
  await sendEmail({
    email: seller.email,
    templateId: emailTemplates.SELLER_PAYMENT,
    data: {
      name: seller.firstName + ' ' + seller.lastName,
      product: [
        {
          name: product.title,
          earned: product.price,
          arrival_date: today,
          order_number: order.product.slice(0, 6)
        }
      ],
      firstName: seller.firstName
    }
  })
  await sendEmail({
    email: buyer.email,
    templateId: emailTemplates.BUYER_DELIVERED,
    data: {
      name: buyer.firstName + ' ' + buyer.lastName,
      product: product.title,
      order_number: order.id.slice(0, 6),
      delivery_method: order.shippingCarrier,
    }
  })
}