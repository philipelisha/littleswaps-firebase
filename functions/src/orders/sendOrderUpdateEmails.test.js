import { format } from "date-fns";
import { emailTemplates, sendEmail } from "../utils/index.js"
import { sendDeliveredEmails, sendShippedEmails } from "./sendOrderUpdateEmails";

jest.mock('../utils/index.js', () => ({
  ...jest.requireActual('../utils/index.js'),
  sendEmail: jest.fn().mockResolvedValue(),
}))

const mockProductId = 'product456';
const mockSellerData = {
  email: 'seller email',
  firstName: 'seller first name',
  lastName: 'seller last name',
};
const mockBuyerData = {
  email: "buyer email",
  firstName: 'buyer first name',
  lastName: 'buyer last name',
};
const mockProductData = {
  buyer: 'buyerid',
  user: 'sellerid',
  title: 'Test Product',
  shippingNumber: 'shippingNumber',
  price: 100,
  colors: ['red', 'green'],
  size: 'OS',
};
const mockOrderData = {
  id: 'orderid',
  product: mockProductId,
  title: 'Test Product',
  shippingCarrier: 'shippingCarrier',
  shippingNumber: 'shippingNumber',
  paymentIntent: 'pi_12345',
  purchasePriceDetails: {
    total: 150,
    shippingRate: 15,
  }
};
const mockAddressData = {
  name: 'buyer address',
  street: '123 main st',
  street2: 'apt 21',
  city: 'Cityville',
  zip: '999999'
};


beforeEach(() => {
  jest.clearAllMocks();
});

describe('sendShippedEmails', () => {
  it('should call to send the emails', async () => {
    await sendShippedEmails({
      buyer: mockBuyerData,
      seller: mockSellerData,
      product: mockProductData,
      order: mockOrderData,
      address: mockAddressData,
    })
    
    expect(sendEmail).toHaveBeenCalledWith({
      email: 'seller email',
      templateId: emailTemplates.SELLER_SHIPPED,
      data: {
        name: 'seller first name seller last name',
        product: [
          {
            name: mockProductData.title,
            tracking: mockProductData.shippingNumber,
            order_number: mockOrderData.product.slice(0, 6),
            delivery_method: 'shippingCarrier'
          }
        ],
        firstName: 'seller first name'
      }
    })
    
    expect(sendEmail).toHaveBeenCalledWith({
      email: 'buyer email',
      templateId: emailTemplates.BUYER_SHIPPED,
      data: {
        name: 'buyer first name buyer last name',
        order: {
          total: mockOrderData.purchasePriceDetails.total,
          subtotal: mockProductData.price,
          order_number: mockOrderData.id.slice(0, 6),
          shipping_day: format(new Date(), 'MM/dd/yyyy'),
          delivery_method: mockOrderData.shippingCarrier,
          tracking_number: mockProductData.shippingNumber,
          delivery_method_fee: mockOrderData.purchasePriceDetails.shippingRate
        },
        product: [
          {
            name: mockProductData.title,
            size: mockProductData.size,
            color: mockProductData.colors.join(', '),
            price: mockProductData.price,
          }
        ],
        customer: {
          name: mockAddressData.name,
          address_1st_line: `${mockAddressData.street} ${mockAddressData.street2}`,
          address_2nd_line: `${mockAddressData.city}, ${mockAddressData.state} ${mockAddressData.zip}`
        },
        firstName: 'buyer first name'
      }
    })
  })
});

describe('sendDeliveredEmails', () => {
  it('should call to send the emails', async () => {
    const today = format(new Date(), 'MM/dd/yyyy');
    await sendDeliveredEmails({
      product: mockProductData,
      order: mockOrderData,
      seller: mockSellerData,
      buyer: mockBuyerData,
    })
    
    expect(sendEmail).toHaveBeenCalledWith({
      email: 'seller email',
      templateId: emailTemplates.SELLER_DELIVERED,
      data: {
        name: 'seller first name seller last name',
        product: [
          {
            name: mockProductData.title,
            arrival_date: today,
            order_number: mockOrderData.product.slice(0, 6),
          }
        ],
        firstName: 'seller first name'
      }
    })
    
    expect(sendEmail).toHaveBeenCalledWith({
      email: 'seller email',
      templateId: emailTemplates.SELLER_PAYMENT,
      data: {
        name: 'seller first name seller last name',
        product: [
          {
            name: mockProductData.title,
            earned: mockProductData.price,
            arrival_date: today,
            order_number: mockOrderData.product.slice(0, 6),
          }
        ],
        firstName: 'seller first name'
      }
    })
    
    expect(sendEmail).toHaveBeenCalledWith({
      email: 'buyer email',
      templateId: emailTemplates.BUYER_DELIVERED,
      data: {
        name: 'buyer first name buyer last name',
        product: mockProductData.title,
        order_number: mockOrderData.id.slice(0, 6),
        delivery_method: mockOrderData.shippingCarrier,
      }
    })
  })
});