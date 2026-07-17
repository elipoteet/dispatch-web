export function Skeleton() {
  return (
    <div className="skeleton-wrap active" aria-hidden="true">
      <div className="sk-header">
        <div className="sk-header-top">
          <div className="skeleton sk-line" style={{ width: 240 }} />
          <div className="skeleton sk-line" style={{ width: 180 }} />
        </div>
        <div className="sk-row">
          <div>
            <div className="skeleton sk-ticker" />
            <div className="skeleton sk-name" />
            <div className="skeleton sk-industry" />
          </div>
          <div>
            <div className="skeleton sk-price" />
            <div className="skeleton sk-change" />
          </div>
          <div>
            <div className="skeleton sk-verdict" />
          </div>
        </div>
      </div>
      <div className="sk-stats">
        {[0, 1, 2, 3].map((i) => (
          <div className="sk-stat" key={i}>
            <div className="skeleton sk-line l1" />
            <div className="skeleton sk-line l2" />
          </div>
        ))}
      </div>
      <div className="sk-scorecard">
        <div className="skeleton sk-line" style={{ width: 160, height: 22, marginBottom: 24 }} />
        {[0, 1, 2].map((i) => (
          <div className="sk-row-item" key={i}>
            <div className="skeleton sk-line" style={{ height: 20 }} />
            <div className="skeleton sk-line" style={{ height: 20 }} />
            <div className="skeleton sk-line" style={{ height: 16 }} />
          </div>
        ))}
      </div>
      <div className="sk-chart-wrap">
        <div className="skeleton sk-chart" />
      </div>
    </div>
  );
}
