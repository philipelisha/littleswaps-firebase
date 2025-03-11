import { format } from "date-fns"
import { emailTemplates, sendEmail } from "../utils/index.js"

export const sendShippedEmails = async ({
  buyer,
  seller,
  sale,
  order,
  address
}) => {
  await sendEmail({
    email: seller.email,
    templateId: emailTemplates.SELLER_SHIPPED,
    data: {
      name: seller.firstName + ' ' + seller.lastName,
      product: !sale.productBundle ? [
        {
          name: sale.product.title,
          tracking: sale.shippingNumber,
          order_number: sale.id.slice(0, 6),
          delivery_method: order.shippingCarrier
        }
      ] : sale.productBundle?.map(product => ({
        name: product.title,
        tracking: sale.shippingNumber,
        order_number: sale.id.slice(0, 6),
        delivery_method: order.shippingCarrier
      })),
      firstName: seller.firstName
    }
  })
  const subTotal = (sale.productBundle || []).reduce((total, product) => total + parseFloat(product.price), 0);
  await sendEmail({
    email: buyer.email,
    templateId: emailTemplates.BUYER_SHIPPED,
    data: {
      name: buyer.firstName + ' ' + buyer.lastName,
      order: {
        total: order.purchasePriceDetails.total,
        subtotal: sale.productBundle ? subTotal : sale.product.price,
        order_number: order.id.slice(0, 6),
        order_number_full: order.id,
        shipping_day: format(new Date(), 'MM/dd/yyyy'),
        delivery_method: order.shippingCarrier,
        tracking_number: sale.shippingNumber,
        delivery_method_fee: sale.shippingIncluded ? 0 : order.purchasePriceDetails.shippingRate
      },
      product: !sale.productBundle ? [
        {
          name: sale.product.title,
          size: sale.product.size,
          color: sale.product.colors.join(', '),
          price: sale.product.price,
        }
      ] : sale.productBundle?.map(product => ({
        name: product.title,
        size: product.size,
        color: product.colors.join(', '),
        price: product.price,
      })),
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
  sale,
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
      product: !sale.productBundle ? [
        {
          name: sale.product.title,
          arrival_date: today,
          order_number: sale.id.slice(0, 6)
        }
      ] : sale.productBundle?.map(product => ({
        name: product.title,
        arrival_date: today,
        order_number: sale.id.slice(0, 6)
      })),
      firstName: seller.firstName
    }
  })

  const totalPrice = (sale.productBundle || []).reduce((total, product) => total + parseFloat(product.price), 0);
  const earned = ((totalPrice || sale.product.price) - sale.purchasePriceDetails?.commission - (sale.shippingIncluded ? sale.purchasePriceDetails?.shippingRate : 0)).toFixed(2);
  await sendEmail({
    email: seller.email,
    templateId: emailTemplates.SELLER_PAYMENT,
    data: {
      name: seller.firstName + ' ' + seller.lastName,
      product: !sale.productBundle ? [
        {
          name: product.title,
          earned,
          arrival_date: today,
          order_number: sale.id.slice(0, 6)
        }
      ] : sale.productBundle?.map(product => ({
        name: product.title,
        earned,
        arrival_date: today,
        order_number: sale.id.slice(0, 6)
      })),
      firstName: seller.firstName
    }
  })
  await sendEmail({
    email: buyer.email,
    templateId: emailTemplates.BUYER_DELIVERED,
    data: {
      name: buyer.firstName + ' ' + buyer.lastName,
      product: !sale.productBundle ? sale.product.title : sale.productBundle[0].title + ` + ${sale.productBundle.length - 1} more`,
      order_number: order.id.slice(0, 6),
      delivery_method: order.shippingCarrier,
    }
  })
}