export const insertQuery = `
  INSERT INTO products(
    firestoreId, 
    active, 
    userId, 
    title, 
    mainImage, 
    price, 
    priceCurrency, 
    location, 
    latitude, 
    longitude, 
    mainCategory, 
    subCategory, 
    size, 
    brand, 
    colors, 
    isNewWithTags, 
    likes, 
    updated,
    availableShipping,
    shippingIncluded,
    condition,
    username,
    originalPrice,
    gender
  )
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
`;

export const updateQuery = `
  UPDATE products
  SET
    active = $1,
    userId = $2,
    title = $3,
    mainImage = $4,
    price = $5,
    priceCurrency = $6,
    location = $7,
    latitude = $8,
    longitude = $9,
    mainCategory = $10,
    subCategory = $11,
    size = $12,
    brand = $13,
    colors = $14,
    isNewWithTags = $15,
    likes = $16,
    updated = $17,
    availableShipping = $18,
    purchaseDate = $19,
    condition = $20,
    shippingIncluded = $21,
    username = $22,
    originalPrice = $23,
    gender = $24
  WHERE firestoreid = $25
`;

export const deleteQuery = 'DELETE FROM products WHERE firestoreid = $1'

export const searchQuery = ({
  isProfile,
  isCurrentUser,
  sortBy,
  sortDirection,
  offset,
  limit = 10,
  isMainCategoryArray,
  isSubCategoryArray,
  isBrandArray,
}) => {
  const baseQuery = `
    SELECT *, updated::TEXT AS updated_at, COUNT(*) OVER() AS total_count 
    FROM products
    WHERE
      (${isCurrentUser} OR active = true)
      AND (
        $1 IS NULL OR
        title ILIKE $1 OR
        brand ILIKE $1 OR
        maincategory ILIKE $1 OR
        subcategory ILIKE $1
      )
      AND ($5 IS NULL OR $5 = ANY(colors))
      AND ($6 IS NULL OR size = $6)
      AND (
        ($7 IS NULL AND $8 IS NULL) OR
        (price BETWEEN $7 AND $8)
      )
      AND ($9 IS NULL OR availableShipping = $9)
      AND ($10 IS NULL OR condition = $10)
      AND ($11 IS NULL OR gender = $11)
      AND (
        ($16 IS NOT NULL AND userid = ANY($16)) 
        OR 
        ($16 IS NULL AND ($12 IS NULL OR userid ${isProfile ? '=' : '!='} $12))
      )
      AND (
        $13 IS NULL OR
        ST_DWithin(
          ST_MakePoint(longitude, latitude)::geography,
          ST_MakePoint($13, $14)::geography,
          $15
        )
      )
      AND ($17 IS NULL OR updated >= TO_TIMESTAMP($17))
  `;

  const mainCategoryCondition = isMainCategoryArray
    ? `AND ($2 IS NULL OR maincategory = ANY($2))`
    : `AND ($2 IS NULL OR maincategory = $2)`;

  const subCategoryCondition = isSubCategoryArray
    ? `AND ($3 IS NULL OR subcategory = ANY($3))`
    : `AND ($3 IS NULL OR subcategory = $3)`;

  const brandCondition = isBrandArray
    ? `AND ($4 IS NULL OR brand = ANY($4))`
    : `AND ($4 IS NULL OR brand = $4)`;

  return `
    ${baseQuery}
    ${mainCategoryCondition}
    ${subCategoryCondition}
    ${brandCondition}
    ORDER BY ${isCurrentUser ? 'active DESC,' : ''} ${sortBy} ${sortDirection}
    LIMIT ${limit} OFFSET ${offset};
  `;
};
