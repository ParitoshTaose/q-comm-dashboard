
from flask import Flask, render_template, jsonify, request, Response
import joblib
import numpy as np
import pandas as pd

app = Flask(__name__)

# ─── 3 Clusters: Steady Converters / Hesitant Browsers / Nudge-Responsive Impulsives ──
CLUSTER_THRESHOLDS = {0: 0.52, 1: 0.17, 2: 0.68}
CLUSTER_LABELS     = {
    0: 'Steady Converters',
    1: 'Hesitant Browsers',
    2: 'Nudge-Responsive Impulsives'
}

# ─── Leak-free features (validated 0.95 AUC) ─────────────────────────────────
X_features = [
    'num_view', 'num_add_to_cart', 'num_remove_from_cart', 'eta_minutes',
    'has_nudge', 'num_fomo_reminder', 'num_urgency_timer', 'session_duration_min',
    'is_short_session', 'kmeans_cluster', 'day_of_week', 'hour', 'category'
]

# ─── Nudge analytics by cluster (for analytics tab) ──────────────────────────
NUDGE_PLAYBOOK = {
    0: {
        'primary_goal':   'Increase basket size (AOV)',
        'expected_lift':  '+15% AOV',
        'nudge_cost':     'Low',
        'tactics': {
            'Bundles':       'Always',
            'Loyalty':       'Always',
            'Free Shipping': 'Loyalty tier',
            'Discounts':     'Rare',
            'Scarcity':      'Never',
            'Countdown':     'Never',
            'Social Proof':  'Rare'
        }
    },
    1: {
        'primary_goal':   'Convert browsers to buyers',
        'expected_lift':  '+8% conversion rate',
        'nudge_cost':     'Medium',
        'tactics': {
            'Price Drops':     'Always',
            'Abandonment':     'Always',
            'Free Shipping':   'Threshold',
            'Bundles':         'Always',
            'Countdown':       'Frequent',
            'Social Proof':    'Moderate',
            'Scarcity':        'Moderate'
        }
    },
    2: {
        'primary_goal':   'Maximize impulse attach rate',
        'expected_lift':  '+25% attach rate',
        'nudge_cost':     'Low (high ROI)',
        'tactics': {
            'Scarcity':     'MAX',
            'Countdown':    'Always',
            'Flash Bundles': 'Frequent',
            'Social Proof': 'Always',
            'FOMO':         'MAX',
            'Discounts':    'Strategic'
        }
    }
}


# ─── ImpulseRecoEngine ────────────────────────────────────────────────────────
class ImpulseRecoEngine:
    def __init__(self, model_path, data_path):
        self.model    = joblib.load(model_path)
        self.data     = pd.read_csv(data_path)
        self.features = X_features

        # Pre-score all rows at startup
        if 'ml_impulse_pred' not in self.data.columns:
            print("Pre-scoring data...")
            X_all = self.data[self.features].fillna(0)
            self.data['ml_impulse_pred'] = self.model.predict_proba(X_all)[:, 1]

        # Ensure price column exists (fallback to 0 if missing)
        if 'price' not in self.data.columns:
            self.data['price'] = 0.0

    def _reco_cols(self, df):
        """Return only the columns needed for reco output."""
        cols = ['product_id', 'ml_impulse_pred', 'category', 'price']
        available = [c for c in cols if c in df.columns]
        return df[available].round({'ml_impulse_pred': 3, 'price': 2})

    def get_recommendations(self, session_id, top_k=10):
        session_mask = self.data['session_id'] == session_id
        if not session_mask.any():
            return {'error': f'Session {session_id} not found'}

        session_data = self.data[session_mask].copy()
        cluster      = int(session_data['kmeans_cluster'].iloc[0])
        threshold    = CLUSTER_THRESHOLDS[cluster]

        # 1. Session recos (priority)
        session_recos = session_data[
            session_data['ml_impulse_pred'] >= threshold
        ].nlargest(top_k // 2, 'ml_impulse_pred')

        # 2. User history (other sessions)
        user_id   = session_data['user_id'].iloc[0]
        user_mask = (self.data['user_id'] == user_id) & (self.data['session_id'] != session_id)
        user_recos = (self.data[user_mask]
                      .nlargest(top_k // 4, 'ml_impulse_pred')
                      if user_mask.any() else pd.DataFrame())

        # 3. Cluster peers
        cluster_recos = (self.data[self.data['kmeans_cluster'] == cluster]
                         .nlargest(top_k // 4, 'ml_impulse_pred'))

        reco_list = [df for df in [session_recos, user_recos, cluster_recos] if len(df) > 0]
        if not reco_list:
            return {'error': 'No recommendations available'}

        all_recos   = pd.concat(reco_list)
        final_recos = all_recos.drop_duplicates('product_id').nlargest(top_k, 'ml_impulse_pred')

        return {
            'session_id':   session_id,
            'cluster':      cluster,
            'cluster_label': CLUSTER_LABELS.get(cluster, 'Unknown'),
            'threshold':    threshold,
            'sources': {
                'session':      len(session_recos),
                'user_history': len(user_recos),
                'cluster':      len(cluster_recos)
            },
            'total_recos': len(final_recos),
            'recos':        self._reco_cols(final_recos).to_dict('records')
        }

    def get_user_recommendations(self, user_id, top_k=10):
        user_sessions = self.data[self.data['user_id'] == user_id]['session_id'].unique()
        if len(user_sessions) == 0:
            return {'error': f'User {user_id} not found'}

        user_data = self.data[self.data['session_id'].isin(user_sessions)].copy()
        cluster   = int(user_data['kmeans_cluster'].mode().iloc[0])
        threshold = CLUSTER_THRESHOLDS[cluster]

        user_recos = user_data[
            user_data['ml_impulse_pred'] >= threshold
        ].nlargest(top_k * 2, 'ml_impulse_pred')

        cluster_recos = (self.data[self.data['kmeans_cluster'] == cluster]
                         .nlargest(top_k // 2, 'ml_impulse_pred'))

        all_recos   = pd.concat([user_recos, cluster_recos]).drop_duplicates('product_id')
        final_recos = all_recos.nlargest(top_k, 'ml_impulse_pred')

        return {
            'user_id':           user_id,
            'sessions_analyzed': len(user_sessions),
            'cluster':           cluster,
            'cluster_label':     CLUSTER_LABELS.get(cluster, 'Unknown'),
            'threshold':         threshold,
            'sources': {
                'user_sessions': len(user_recos),
                'cluster_boost': len(cluster_recos)
            },
            'total_unique_recos': len(final_recos),
            'recos':              self._reco_cols(final_recos).to_dict('records')
        }

    def get_analytics(self):
        data = self.data

        total_sessions = int(data['session_id'].nunique())
        total_users    = int(data['user_id'].nunique())
        avg_score      = round(float(data['ml_impulse_pred'].mean()), 3)

        # Cluster distribution (labeled)
        cluster_dist = (data.drop_duplicates('session_id')['kmeans_cluster']
                        .value_counts().sort_index())
        cluster_dist_labeled = {CLUSTER_LABELS[k]: int(v) for k, v in cluster_dist.items()}

        # ML score distribution
        score_bins = pd.cut(
            data['ml_impulse_pred'],
            bins=[0, 0.25, 0.5, 0.75, 1.0],
            labels=['0–0.25', '0.25–0.5', '0.5–0.75', '0.75–1.0']
        )
        score_dist = score_bins.value_counts().sort_index().to_dict()

        # Nudge counts across dataset
        nudge_cols = ['num_fomo_reminder', 'num_urgency_timer', 'has_nudge']
        nudge_breakdown = {}
        for col in nudge_cols:
            if col in data.columns:
                nudge_breakdown[col] = int(data[col].sum())

        # Category impulse summary
        cat_summary = {}
        if 'category' in data.columns:
            cat_grp = (data.groupby('category')['ml_impulse_pred']
                       .mean().round(3).sort_values(ascending=False))
            cat_summary = cat_grp.to_dict()

        # Cluster avg scores
        cluster_avg_scores = {}
        for k, lbl in CLUSTER_LABELS.items():
            subset = data[data['kmeans_cluster'] == k]
            if len(subset):
                cluster_avg_scores[lbl] = round(float(subset['ml_impulse_pred'].mean()), 3)

        return {
            'total_sessions':       total_sessions,
            'total_users':          total_users,
            'avg_impulse_score':    avg_score,
            'cluster_distribution': cluster_dist_labeled,
            'score_distribution':   {str(k): int(v) for k, v in score_dist.items()},
            'nudge_breakdown':      nudge_breakdown,
            'category_avg_scores':  cat_summary,
            'cluster_avg_scores':   cluster_avg_scores,
            'nudge_playbook':       NUDGE_PLAYBOOK
        }


# ─── LocationStockEngine ──────────────────────────────────────────────────────
class LocationStockEngine:
    def __init__(self, users_path, sessions_path, products_path):
        self.users                = pd.read_csv(users_path)
        self.session_base         = pd.read_csv(sessions_path)
        self.product_interactions = pd.read_csv(products_path)

    def get_locations(self):
        return sorted(self.users['location'].dropna().unique().tolist())

    def get_location_stock_plan(self, location, top_k=15, min_ml_score=0.3):
        location_users = self.users[self.users['location'] == location]['user_id'].tolist()
        if not location_users:
            return {'error': f'No users found for {location}'}

        location_sessions = self.session_base[
            self.session_base['user_id'].isin(location_users)
        ]['session_id'].unique()

        location_data = self.product_interactions[
            self.product_interactions['session_id'].isin(location_sessions)
        ].copy()

        if len(location_data) == 0:
            return {'error': f'No data for {location}'}

        location_products = location_data.groupby(['product_id', 'category']).agg({
            'ml_impulse_pred': 'mean',
            'hybrid_score':    'mean',
            'bought_quantity': 'sum',
            'num_view':        'sum',
            'session_id':      'nunique'
        }).round(3).reset_index()

        location_products.columns = [
            'product_id', 'category',
            'avg_ml_score', 'avg_hybrid', 'total_sold',
            'total_views', 'session_coverage'
        ]

        qualified    = location_products[location_products['avg_ml_score'] >= min_ml_score]
        top_products = qualified.nlargest(top_k, 'avg_ml_score').copy()
        top_products['stock_qty'] = (
            top_products['total_sold'] * top_products['avg_ml_score']
        ).round(0).astype(int)

        result = top_products.sort_values('stock_qty', ascending=False)[
            ['product_id', 'category', 'avg_ml_score', 'total_sold', 'stock_qty']
        ]

        cat_breakdown = result.groupby('category')['stock_qty'].sum().to_dict()

        return {
            'location':          location,
            'num_users':         len(location_users),
            'num_sessions':      int(len(location_sessions)),
            'avg_ml_score':      round(float(result['avg_ml_score'].mean()), 3),
            'total_sold':        int(result['total_sold'].sum()),
            'products':          result.to_dict('records'),
            'category_breakdown': {str(k): int(v) for k, v in cat_breakdown.items()}
        }

    def get_region_comparison(self):
        comparison = []
        for loc in self.get_locations():
            result = self.get_location_stock_plan(loc, top_k=10)
            if 'error' not in result:
                comparison.append({
                    'location':     loc,
                    'num_users':    result['num_users'],
                    'num_sessions': result['num_sessions'],
                    'avg_ml_score': result['avg_ml_score'],
                    'total_sold':   result['total_sold']
                })
        return comparison


# ─── Init engines ─────────────────────────────────────────────────────────────
reco_engine  = ImpulseRecoEngine(
    'final_impulse_clf2.pkl',
    'product_interactions.csv'
)
stock_engine = LocationStockEngine(
    'users_raw.csv',
    'session_base_scored.csv',
    'product_interactions_for_location.csv'
)


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    locations = stock_engine.get_locations()
    return render_template('dashboard.html', locations=locations)


@app.route('/api/session_reco', methods=['POST'])
def session_reco():
    data       = request.get_json()
    session_id = int(data.get('session_id', 6))
    top_k      = int(data.get('top_k', 10))
    return jsonify(reco_engine.get_recommendations(session_id, top_k))


@app.route('/api/user_reco', methods=['POST'])
def user_reco():
    data    = request.get_json()
    user_id = int(data.get('user_id', 6638))
    top_k   = int(data.get('top_k', 10))
    return jsonify(reco_engine.get_user_recommendations(user_id, top_k))


@app.route('/api/regions', methods=['GET'])
def regions():
    return jsonify({'locations': stock_engine.get_locations()})


@app.route('/api/region_stock', methods=['POST'])
def region_stock():
    data      = request.get_json()
    location  = data.get('location', '')
    top_k     = int(data.get('top_k', 15))
    min_score = float(data.get('min_score', 0.3))
    return jsonify(stock_engine.get_location_stock_plan(location, top_k, min_score))


@app.route('/api/analytics', methods=['GET'])
def analytics():
    reco_stats  = reco_engine.get_analytics()
    region_comp = stock_engine.get_region_comparison()
    return jsonify({**reco_stats, 'region_comparison': region_comp})


@app.route('/api/region_stock/export/<location>')
def export_stock(location):
    result = stock_engine.get_location_stock_plan(location)
    if 'error' in result:
        return jsonify(result), 404
    df  = pd.DataFrame(result['products'])
    csv = df.to_csv(index=False)
    return Response(
        csv,
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename=stock_{location}.csv'}
    )


if __name__ == '__main__':
    app.run(host="0.0.0.0", debug=False, port=5000)
