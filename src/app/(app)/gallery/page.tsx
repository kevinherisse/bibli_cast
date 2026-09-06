import { requireUser } from "@/lib/auth";
import GalleryClient from "./GalleryClient";

export default async function GalleryPage() {
  const user = await requireUser();
  return <GalleryClient myEmail={user.email} />;
}
