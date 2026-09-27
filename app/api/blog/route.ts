import connectDB from "@/lib/db";
import BlogModel from "@/model/blogModel";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const { slug, title, timeToRead, Titledescription, image, tags, category, dateposted, author, content } = await req.json();

        if (!slug || !title || !timeToRead || !Titledescription || !image || !tags || !category || !author || !content) {
            return NextResponse.json({ error: "All fields are required" }, { status: 400 })
        }

        const existingPost = await BlogModel.findOne({ slug });
        if (existingPost) {
            return NextResponse.json({ error: "A post with this title already exists. Please use a different title." }, { status: 409 })
        }

        const parsedTags = Array.isArray(tags) ? tags : tags.split(",").map((t: string) => t.trim()).filter(Boolean);

        const newBlogpost = await BlogModel.create({
            slug,
            title,
            timeToRead,
            Titledescription,
            image,
            tags: parsedTags,
            category,
            dateposted: dateposted ? new Date(dateposted) : new Date(),
            author,
            content
        });

        return NextResponse.json({ message: "Blog post created successfully", blog: newBlogpost }, { status: 201 })

    } catch (error) {
        console.error("Error creating blog post:", error)
        return NextResponse.json({ message: "Internal server error" }, { status: 500 })
    }
}
export async function GET() {
    try {
        await connectDB();
        // Public endpoint: only published posts, newest first.
        // `published` may be missing on older docs — treat missing as published.
        // Sort by createdAt (always present + a real Date) so ordering is stable;
        // dateposted is unreliable on older docs.
        const blogs = await BlogModel.find({ published: { $ne: false } })
            .sort({ createdAt: -1 });
        return NextResponse.json({ blogs }, { status: 200 })
    } catch (error) {
        console.error("Error fetching blog posts:", error)
        return NextResponse.json({ message: "Internal server error" }, { status: 500 })
    }
}