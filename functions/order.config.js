const productCommon = {
  'COMPLETED': 'COMPLETED',
  'PENDING_SWAPSPOT_ARRIVAL': 'PENDING_SWAPSPOT_ARRIVAL',
  'PENDING_SWAPSPOT_PICKUP': 'PENDING_SWAPSPOT_PICKUP',
};

const productShippingCommon = {
  'PENDING_SHIPPING': 'PENDING_SHIPPING', 
  'LABEL_CREATED': 'LABEL_CREATED',
  'SHIPPED': 'SHIPPED',
  'OUT_FOR_DELIVERY': 'OUT_FOR_DELIVERY',
};

export const statusTypes = {
  productStatus: {
    ...productCommon,
    ...productShippingCommon,
    'ACTIVE': 'ACTIVE',
    'INACTIVE': 'INACTIVE',
    'PENDING_ACTIVE_DATE': 'PENDING_ACTIVE_DATE',
  },
  orderStatus: {
    ...productCommon,
    ...productShippingCommon
  },
  swapSpotInventoryStatus: {
    ...productCommon
  },
};

export const orderActions = {
  'SWAPSPOT_RECEIVING': 'SWAPSPOT_RECEIVING',
  'SWAPSPOT_FULFILLMENT': 'SWAPSPOT_FULFILLMENT',
  'LABEL_CREATED': 'LABEL_CREATED',
  'SHIPPED': 'SHIPPED',
  'OUT_FOR_DELIVERY': 'OUT_FOR_DELIVERY',
  'DELIVERED': 'DELIVERED',
};