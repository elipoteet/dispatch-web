import { Skeleton } from "@/components/research/Skeleton";

export default function Loading() {
  return (
    <section className="page active" id="page-analyzer">
      <div className="analyzer-head">
        <div className="label">Research Desk</div>
        <h1>Pulling the memo together.</h1>
        <p>Fetching live price, fundamentals, analyst consensus, and news.</p>
      </div>
      <Skeleton />
    </section>
  );
}
