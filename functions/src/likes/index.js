import {logger} from "firebase-functions";
import {getIdsFromEvent} from "../utils/index.js";
import {updateProductLike} from "./updateProductLike.js";

export const createLike = async (event) => {
  logger.info("~~~~~~~~~~~~ START createLike ~~~~~~~~~~~~", event);
  try {
    const {document} = getIdsFromEvent(event, "likeId");

    await updateProductLike(document, true);

    return null;
  } catch (error) {
    logger.error('Error processing addLike error:', error);
    return null;
  }
};

export const deleteLike = async (event) => {
  logger.info("~~~~~~~~~~~~ START deleteLike ~~~~~~~~~~~~", event);
  try {
    const {document} = getIdsFromEvent(event, "likeId");

    await updateProductLike(document);

    return null;
  } catch (error) {
    logger.error('Error processing addLike error:', error);
    return null;
  }
};
