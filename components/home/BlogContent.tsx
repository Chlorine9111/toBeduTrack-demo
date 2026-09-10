import { POSTS_EN, type Category } from "@/lib/blog/posts";
import { EN } from "@/lib/home/translations";
import BlogContentClient, {
  type BlogContentClientPost,
} from "@/components/home/BlogContentClient";

const CATEGORY_LABELS: Record<Category, string> = {
  all: EN.blogPage.allEntries,
  philosophy: EN.blogPage.philosophy,
  analysis: EN.blogPage.analysis,
  practical: EN.blogPage.practical,
};

const BLOG_POSTS: BlogContentClientPost[] = POSTS_EN.map((post) => ({
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  coverImage: post.coverImage,
  category: post.category,
  readTime: post.readTime,
  date: post.date,
}));

export default function BlogContent() {
  return (
    <BlogContentClient
      posts={BLOG_POSTS}
      categoryLabels={CATEGORY_LABELS}
      copy={{
        title: EN.blogPage.title,
        subtitle: EN.blogPage.subtitle,
        categoriesLabel: EN.blogPage.categories,
        newestFirstLabel: EN.blogPage.newestFirst,
        readTimeLabel: EN.blogPage.readTime,
        olderLabel: EN.blogPage.older,
        newerLabel: EN.blogPage.newer,
      }}
    />
  );
}
