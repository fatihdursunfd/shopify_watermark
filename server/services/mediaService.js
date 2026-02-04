import { shopify } from '../config/shopify-app.js';
import { graphqlRequest } from '../utils/shopify-client.js';
import {
    GET_PRODUCT_MEDIA,
    FILE_UPDATE,
    GET_FILE_ID_FROM_MEDIA,
    PRODUCT_REORDER_MEDIA,
    PRODUCT_DELETE_MEDIA
} from '../graphql/watermark-queries.js';

/**
 * Validates GraphQL response for userErrors
 */
function throwOnUserErrors(response, operationName) {
    // Check main userErrors (e.g. fileUpdate.userErrors)
    const data = response[operationName];
    if (data && data.userErrors && data.userErrors.length > 0) {
        throw new Error(`${operationName} failed: ${JSON.stringify(data.userErrors)}`);
    }
    // Check for other potential error arrays (e.g. mediaUserErrors)
    if (data && data.mediaUserErrors && data.mediaUserErrors.length > 0) {
        throw new Error(`${operationName} failed: ${JSON.stringify(data.mediaUserErrors)}`);
    }
}

/**
 * Fetches product media with details
 */
export async function getProductMedia(shop, accessToken, productGid) {
    const response = await graphqlRequest(shop, accessToken, GET_PRODUCT_MEDIA, { id: productGid });
    if (!response.product) return [];

    return response.product.media.edges.map(edge => ({
        id: edge.node.id,
        type: edge.node.mediaContentType,
        url: edge.node.image?.url,
        fileId: edge.node.file?.id // Optimistic fetch if available in query
    }));
}

/**
 * Resolves a MediaImage GI (gid://shopify/MediaImage/...) to a File GID (gid://shopify/File/...)
 * Because fileUpdate requires File IDs.
 */
export async function resolveFileIdFromMaybeMediaId(shop, accessToken, id) {
    if (!id) return null;
    if (id.includes('/File/')) return id; // Already a file ID

    // It's likely a MediaImage, fetch corresponding File ID
    const response = await graphqlRequest(shop, accessToken, GET_FILE_ID_FROM_MEDIA, { id });
    const fileId = response.node?.file?.id;

    if (!fileId) {
        console.warn(`[MediaService] Could not resolve File ID for Media: ${id}. It might not be backed by a file.`);
        return id; // Return original as fallback, though it might fail in fileUpdate
    }
    return fileId;
}

/**
 * Attaches a file to a product (References to Add)
 */
export async function attachFileToProduct(shop, accessToken, fileId, productGid) {
    const resolvedFileId = await resolveFileIdFromMaybeMediaId(shop, accessToken, fileId);

    const variables = {
        files: [{
            id: resolvedFileId,
            referencesToAdd: [productGid]
        }]
    };

    const response = await graphqlRequest(shop, accessToken, FILE_UPDATE, variables);
    throwOnUserErrors(response, 'fileUpdate');

    console.log(`[MediaService] Attached file ${resolvedFileId} to product ${productGid}`);
}

/**
 * Detaches a file from a product (References to Remove)
 */
export async function detachFileFromProduct(shop, accessToken, fileId, productGid) {
    const resolvedFileId = await resolveFileIdFromMaybeMediaId(shop, accessToken, fileId);

    const variables = {
        files: [{
            id: resolvedFileId,
            referencesToRemove: [productGid]
        }]
    };

    const response = await graphqlRequest(shop, accessToken, FILE_UPDATE, variables);
    throwOnUserErrors(response, 'fileUpdate');

    console.log(`[MediaService] Detached file ${resolvedFileId} from product ${productGid}`);
}

/**
 * Reorders product media
 */
export async function reorderProductMedia(shop, accessToken, productGid, moves) {
    // moves: Array of { id: string, newPosition: string }
    const response = await graphqlRequest(shop, accessToken, PRODUCT_REORDER_MEDIA, {
        id: productGid,
        moves
    });
    throwOnUserErrors(response, 'productReorderMedia');
}

/**
 * Safely deletes a file (Optional final step)
 */
export async function safeDeleteMedia(shop, accessToken, productGid, mediaId) {
    const response = await graphqlRequest(shop, accessToken, PRODUCT_DELETE_MEDIA, {
        productId: productGid,
        mediaIds: [mediaId]
    });
    throwOnUserErrors(response, 'productDeleteMedia');
}
