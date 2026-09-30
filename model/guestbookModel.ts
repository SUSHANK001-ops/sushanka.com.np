import mongoose from "mongoose";

interface IReply {
  userId?: string;
  name: string;
  avatar?: string;
  message: string;
  // True if the reply author is an allowlisted admin (for the crown badge).
  isAdmin?: boolean;
  // Admin moderation: hidden replies stay in the DB but aren't shown publicly.
  isHidden?: boolean;
  createdAt?: Date;
}

interface IGuestbookEntry {
  name: string;
  message: string;
  avatar?: string;
  provider?: string;
  // Stable per-user id (from auth) to prevent duplicate spam per person.
  userId?: string;
  // True if the entry author is an allowlisted admin (for the crown badge).
  isAdmin?: boolean;
  // Optional user-uploaded image attached to the message.
  image?: string;
  // Cloudinary public_id so we can destroy the asset if the post is deleted.
  imagePublicId?: string;
  // Admin moderation: hidden entries are kept in the DB but not shown publicly.
  isHidden?: boolean;
  isTextHidden?: boolean;
  isImageHidden?: boolean;
  // Stable per-user ids of everyone who liked this entry.
  likes?: string[];
  likeProfiles?: {
    userId: string;
    name?: string;
    avatar?: string;
  }[];
  reactions?: {
    userId: string;
    emoji: string;
    name?: string;
    avatar?: string;
  }[];
  // Text-only replies.
  replies?: IReply[];
}

const ReplySchema = new mongoose.Schema<IReply>(
  {
    userId: { type: String, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    avatar: { type: String },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    isAdmin: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const GuestbookSchema = new mongoose.Schema<IGuestbookEntry>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    avatar: { type: String },
    provider: { type: String },
    userId: { type: String, index: true },
    isAdmin: { type: Boolean, default: false },
    image: { type: String },
    imagePublicId: { type: String },
    isHidden: { type: Boolean, default: false, index: true },
    isTextHidden: { type: Boolean, default: false },
    isImageHidden: { type: Boolean, default: false },
    likes: { type: [String], default: [] },
    likeProfiles: {
      type: [
        {
          userId: { type: String, required: true },
          name: { type: String },
          avatar: { type: String },
        },
      ],
      default: [],
    },
    reactions: {
      type: [
        {
          userId: { type: String, required: true },
          emoji: { type: String, required: true, maxlength: 8 },
          name: { type: String },
          avatar: { type: String },
        },
      ],
      default: [],
    },
    replies: { type: [ReplySchema], default: [] },
  },
  { timestamps: true }
);

const GuestbookModel =
  mongoose.models.Guestbook ||
  mongoose.model<IGuestbookEntry>("Guestbook", GuestbookSchema);

export default GuestbookModel;
