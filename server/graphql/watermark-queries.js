/**
 * GraphQL queries and mutations for Watermark feature
 * Shopify Admin API interactions
 */

// ============================================================================
// PRODUCT QUERIES
// ============================================================================

export const GET_PRODUCT_MEDIA = `
  query getProductMedia($id: ID!) {
    product(id: $id) {
      id
      title
      variants(first: 100) {
        edges {
          node {
            id
            image {
              id
            }
          }
        }
      }
      media(first: 50) {
        edges {
          node {
            ... on MediaImage {
              id
              file {
                id
              }
              image {
                id
                url
                width
                height
              }
              mediaContentType
            }
            ... on Video {
              id
              mediaContentType
            }
            ... on Model3d {
              id
              mediaContentType
            }
          }
        }
      }
    }
  }
`;

export const GET_ALL_PRODUCTS = `
  query getAllProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "status:active") {
      edges {
        node {
          id
          title
          hasOnlyDefaultVariant
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_PRODUCTS_BY_COLLECTION = `
  query getProductsByCollection($collectionId: ID!, $cursor: String) {
    collection(id: $collectionId) {
      id
      title
      products(first: 50, after: $cursor) {
        edges {
          node {
            id
            title
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const GET_PRODUCTS_BY_IDS = `
  query getProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
      }
    }
  }
`;

export const GET_COLLECTIONS = `
  query getCollections($cursor: String) {
    collections(first: 50, after: $cursor) {
      edges {
        node {
          id
          title
          productsCount {
            count
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// FILE UPLOAD MUTATIONS
// ============================================================================

export const STAGED_UPLOADS_CREATE = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const FILE_CREATE = `
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        ... on GenericFile {
          id
          url
        }
        ... on MediaImage {
          id
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================================================
// PRODUCT MEDIA MUTATIONS
// ============================================================================

export const PRODUCT_CREATE_MEDIA = `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          image {
            id
            url
            width
            height
          }
          alt
          mediaContentType
        }
      }
      mediaUserErrors {
        field
        message
        code
      }
      product {
        id
      }
    }
  }
`;

export const PRODUCT_DELETE_MEDIA = `
  mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      deletedProductImageIds
      mediaUserErrors {
        field
        message
        code
      }
      product {
        id
      }
    }
  }
`;

export const PRODUCT_UPDATE_MEDIA = `
  mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
        }
      }
      mediaUserErrors {
        field
        message
        code
      }
      product {
        id
      }
    }
  }
`;

export const PRODUCT_VARIANTS_BULK_UPDATE = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
      }
      productVariants {
        id
        image {
          id
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const PRODUCT_REORDER_MEDIA = `
  mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job {
        id
        done
      }
      mediaUserErrors {
        field
        message
        code
      }
    }
  }
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build CreateMediaInput for productCreateMedia mutation
 */
export function buildCreateMediaInput(originalMediaUrl, alt = '') {
  return {
    originalSource: originalMediaUrl,
    alt: alt,
    mediaContentType: 'IMAGE'
  };
}

/**
 * Build UpdateMediaInput for productUpdateMedia mutation
 */
export function buildUpdateMediaInput(mediaId, updates) {
  return {
    id: mediaId,
    ...updates
  };
}

/**
 * Build MoveInput for productReorderMedia mutation
 */
export function buildMoveInput(mediaId, newPosition) {
  return {
    id: mediaId,
    newPosition: newPosition.toString()
  };
}

/**
 * Extract image URLs from product media response
 */
export function extractImageUrls(productMediaResponse) {
  if (!productMediaResponse?.product?.media?.edges) {
    return [];
  }

  return productMediaResponse.product.media.edges
    .filter(edge => edge.node.mediaContentType === 'IMAGE')
    .map(edge => ({
      id: edge.node.id,
      url: edge.node.image.url,
      width: edge.node.image.width,
      height: edge.node.image.height
    }));
}

/**
 * Check if product has featured media
 */
export function getFeaturedMediaId(productMediaResponse) {
  return productMediaResponse?.product?.image?.id || null;
}

export const GET_MEDIA_STATUS = `
  query getMediaStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        id
        status
        image {
          url
        }
      }
    }
  }
`;

export const GET_FILE_URL = `
  query getFileUrl($id: ID!) {
    node(id: $id) {
      ... on GenericFile {
        url
      }
      ... on MediaImage {
        image {
          url
        }
      }
    }
  }
`;

export const FILE_UPDATE = `
  mutation fileUpdate($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        id
        fileStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const GET_FILE_ID_FROM_MEDIA = `
  query getFileIdFromMedia($id: ID!) {
    node(id: $id) {
       ... on MediaImage {
        id
        file {
          id
        }
      }
    }
  }
`;
