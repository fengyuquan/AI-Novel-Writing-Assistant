import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DIRECTOR_CREATE_LINK,
  MANUAL_CREATE_LINK,
  OUTLINE_CREATE_LABEL,
  OUTLINE_CREATE_LINK,
  PRIMARY_CREATE_LABEL,
  SHORT_STORY_CREATE_LINK,
} from "./novelListViewModel";

export function NovelListEmptyState(props: {
  hasAnyNovel: boolean;
}) {
  return (
    <section className="py-12 text-center">
      <h2 className="text-xl font-semibold tracking-normal">
        {props.hasAnyNovel ? "没有符合筛选条件的小说" : "还没有小说项目"}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {props.hasAnyNovel
          ? "可以切换上方筛选条件，或者创建一个新的小说项目。"
          : "第一次使用时，推荐让 AI 自动导演先整理方向、角色、世界观和章节准备。"}
      </p>
      <div className="mobile-full-actions mx-auto mt-5 grid max-w-md gap-2">
        <Button asChild className="h-11 min-h-11 w-full text-base">
          <Link to={DIRECTOR_CREATE_LINK}>{PRIMARY_CREATE_LABEL}</Link>
        </Button>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SHORT_STORY_CREATE_LINK ? (
            <Button asChild variant="secondary" className="h-11 min-h-11 w-full">
              <Link to={SHORT_STORY_CREATE_LINK}>创作短篇</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="h-11 min-h-11 w-full">
            <Link to={OUTLINE_CREATE_LINK}>{OUTLINE_CREATE_LABEL}</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 min-h-11 w-full">
            <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
