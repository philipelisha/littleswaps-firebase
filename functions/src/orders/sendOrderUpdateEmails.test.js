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
  purchasePriceDetails: {
    commission: 10,
  },
  colors: ['red', 'green'],
  size: 'OS',
};
const mockOrderData = {
  id: 'orderid',
  product: {
    productId: mockProductId,
    title: 'Test Product',
    colors: ['red', 'green'],
    price: 100,
  },
  shippingCarrier: 'shippingCarrier',
  shippingNumber: 'shippingNumber',
  paymentIntent: 'pi_12345',
  purchasePriceDetails: {
    total: 150,
    shippingRate: 15,
  }
};
const mockSaleData = {
  id: 'saleid',
  product: {
    productId: mockProductId,
    title: 'Test Product',
    price: 100,
    colors: ['red', 'green'],
  },
  shippingCarrier: 'shippingCarrier',
  shippingNumber: 'shippingNumber',
  paymentIntent: 'pi_12345',
  purchasePriceDetails: {
    total: 150,
    shippingRate: 15,
    commission: 10,
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
      sale: mockSaleData,
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
            order_number: 'saleid'.slice(0, 6),
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
          subtotal: mockSaleData.product.price,
          order_number: mockOrderData.id.slice(0, 6),
          order_number_full: mockOrderData.id,
          shipping_day: format(new Date(), 'MM/dd/yyyy'),
          delivery_method: mockOrderData.shippingCarrier,
          tracking_number: mockSaleData.shippingNumber,
          delivery_method_fee: mockOrderData.purchasePriceDetails.shippingRate
        },
        product: [
          {
            name: mockSaleData.product.title,
            size: mockSaleData.product.size,
            color: mockSaleData.product.colors.join(', '),
            price: mockSaleData.product.price,
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
      sale: mockSaleData,
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
            name: mockSaleData.product.title,
            arrival_date: today,
            order_number: mockSaleData.id.slice(0, 6),
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
            name: mockSaleData.product.title,
            earned: '90.00',
            arrival_date: today,
            order_number: mockSaleData.id.slice(0, 6),
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
        product: mockSaleData.product.title,
        order_number: mockOrderData.id.slice(0, 6),
        delivery_method: mockSaleData.shippingCarrier,
      }
    })
  })
});