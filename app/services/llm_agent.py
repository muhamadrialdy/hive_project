import os
import io
import re
import base64
import json
import markdown
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
from google import genai
from google.genai import types
from app.services.data_pipeline import load_and_clean_data, get_full_summary_stats
from app.services.forecasting import get_forecast

_DARK_LAYOUT = dict(
    plot_bgcolor='#1a1a24',
    paper_bgcolor='#1a1a24',
    font_color='white',
    xaxis=dict(gridcolor='rgba(255,255,255,0.1)'),
    yaxis=dict(gridcolor='rgba(255,255,255,0.1)'),
    margin=dict(l=20, r=20, t=40, b=20),
)

def _fig_to_html(fig) -> str:
    chart_json = fig.to_json()
    b64 = base64.b64encode(chart_json.encode('utf-8')).decode('utf-8')
    return f'<div class="plotly-chart-container" style="width:100%; height:400px; margin-top:10px;" data-bconfig="{b64}"></div>'


_TIME_WORDS = {
    'seminggu': 7, 'sepekan': 7,
    'dua minggu': 14, '2 minggu': 14,
    'sebulan': 30, 'satu bulan': 30,
    'dua bulan': 60, '2 bulan': 60,
    'tiga bulan': 90, '3 bulan': 90, 'triwulan': 90, 'kuartal': 90,
    'enam bulan': 180, '6 bulan': 180, 'semester': 180,
    'setahun': 365, 'satu tahun': 365,
}

def _extract_days(text: str) -> int | None:
    t = text.lower()
    for phrase, days in sorted(_TIME_WORDS.items(), key=lambda x: -len(x[0])):
        if phrase in t:
            return days
    m = re.search(r'(\d+)\s*hari', t)
    if m:
        return int(m.group(1))
    return None

def _has_time_ref(text: str) -> bool:
    t = text.lower()
    if re.search(r'\d+\s*hari', t):
        return True
    return any(w in t for w in _TIME_WORDS)


# ---------------------------------------------------------------------------
# Chart catalog -- each entry: (id, label_id, label_en, generator_fn)
# generator_fn(df, **ctx) -> str (HTML)
# ---------------------------------------------------------------------------

def _chart_enterpriser_trend(df, days=90, **_):
    d = df.tail(days)
    fig = px.line(d, x='date', y='new_enterpriser_count',
                  title=f'Tren Registrasi Enterpriser Baru - {days} Hari Terakhir', markers=True)
    fig.update_layout(**_DARK_LAYOUT)
    fig.update_traces(line_color='#00d1b2')
    return _fig_to_html(fig)

def _chart_sales_trend(df, days=90, **_):
    d = df.tail(days).copy()
    d['rolling_avg_7d'] = d['sales_ep_thousand_idr'].rolling(7, min_periods=1).mean()
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=d['date'], y=d['sales_ep_thousand_idr'],
                             mode='lines+markers', name='Harian', line=dict(color='#00d1b2')))
    fig.add_trace(go.Scatter(x=d['date'], y=d['rolling_avg_7d'],
                             mode='lines', name='Rata-rata 7 hari', line=dict(color='#ffdd57', dash='dash')))
    fig.update_layout(title=f'Tren Penjualan EP - {days} Hari Terakhir (+ Rolling Avg 7 Hari)', **_DARK_LAYOUT)
    return _fig_to_html(fig)

def _chart_online_vs_offline(df, days=90, **_):
    d = df.tail(days)
    fig = go.Figure()
    fig.add_trace(go.Bar(x=d['date'], y=d['transaction_volume_online'], name='Online', marker_color='#00d1b2'))
    fig.add_trace(go.Bar(x=d['date'], y=d['transaction_volume_offline'], name='Offline', marker_color='#ff3860'))
    fig.update_layout(title=f'Transaksi Online vs Offline - {days} Hari Terakhir',
                      barmode='stack', **_DARK_LAYOUT)
    return _fig_to_html(fig)

def _chart_dow_registrations(df, **_):
    dow_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    dow_id = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
    grouped = df.groupby('day_of_week')['new_enterpriser_count'].mean().reindex(dow_order)
    fig = px.bar(x=dow_id, y=grouped.values,
                 title='Rata-rata Registrasi Enterpriser per Hari dalam Seminggu',
                 labels={'x': 'Hari', 'y': 'Rata-rata Registrasi'})
    fig.update_layout(**_DARK_LAYOUT)
    fig.update_traces(marker_color='#3273dc')
    return _fig_to_html(fig)

def _chart_promo_impact(df, **_):
    promo = df.groupby('is_promo_period')['new_enterpriser_count'].mean()
    labels = ['Non-Promo', 'Promo']
    values = [promo.get(0, 0), promo.get(1, 0)]
    fig = px.bar(x=labels, y=values,
                 title='Dampak Promo terhadap Rata-rata Registrasi Enterpriser',
                 labels={'x': 'Periode', 'y': 'Rata-rata Registrasi'})
    fig.update_layout(**_DARK_LAYOUT)
    fig.update_traces(marker_color=['#3273dc', '#ff3860'])
    return _fig_to_html(fig)

def _chart_forecast(df, forecast_days=7, **_):
    try:
        forecast = get_forecast(forecast_days)
        fv = forecast['forecasted_new_enterprisers']
    except Exception:
        return ''
    end_date = df['date'].max()
    future = [end_date + pd.Timedelta(days=i) for i in range(1, len(fv) + 1)]
    fig = px.line(x=future, y=fv,
                  title=f'Prediksi Enterpriser Baru ({forecast_days} Hari Ke Depan)',
                  markers=True, labels={'x': 'Tanggal', 'y': 'Prediksi Jumlah'})
    fig.update_layout(**_DARK_LAYOUT)
    fig.update_traces(line_color='#ff3860', line_dash='dash')
    return _fig_to_html(fig)


CHART_CATALOG = [
    ('enterpriser_trend', 'Tren registrasi Enterpriser baru harian',
     'Menampilkan jumlah registrasi Enterpriser dari waktu ke waktu', _chart_enterpriser_trend),
    ('sales_trend', 'Tren penjualan EP dengan rata-rata bergerak',
     'Grafik penjualan EP harian beserta rolling average 7 hari', _chart_sales_trend),
    ('online_vs_offline', 'Perbandingan transaksi Online vs Offline',
     'Stacked bar chart volume transaksi online dan offline', _chart_online_vs_offline),
    ('dow_registrations', 'Distribusi registrasi per hari dalam seminggu',
     'Rata-rata registrasi Enterpriser berdasarkan hari (Senin-Minggu)', _chart_dow_registrations),
    ('promo_impact', 'Dampak promo terhadap registrasi',
     'Perbandingan rata-rata registrasi pada periode promo vs non-promo', _chart_promo_impact),
    ('forecast', 'Prediksi Enterpriser baru ke depan',
     'Grafik forecast registrasi Enterpriser menggunakan model Random Forest', _chart_forecast),
]

_VIZ_KEYWORDS = ['visualisasi', 'visualisasikan', 'grafik', 'chart', 'plot', 'diagram',
                 'tampilkan grafik', 'buatkan grafik', 'buatkan visualisasi', 'gambarkan']
_ALL_KEYWORDS = ['apa saja', 'semua', 'terserah', 'semuanya', 'apapun', 'bebas', 'all']

def _is_viz_request(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in _VIZ_KEYWORDS)

def _is_select_all(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in _ALL_KEYWORDS)

def _is_chart_selection(text: str) -> list[int]:
    t = text.strip().lower()
    if _is_select_all(t):
        return []
    nums = re.findall(r'\b([1-6])\b', t)
    return [int(n) for n in nums] if nums else []

def _detect_specific_viz(text: str) -> list[str]:
    t = text.lower()
    hits = []
    if any(w in t for w in ['enterpriser', 'registrasi', 'pendaftaran']) and any(w in t for w in ['tren', 'trend', 'waktu', 'harian']):
        hits.append('enterpriser_trend')
    if any(w in t for w in ['penjualan', 'sales', 'ep']) and any(w in t for w in ['tren', 'trend', 'grafik', 'chart', 'visualisasi']):
        hits.append('sales_trend')
    if any(w in t for w in ['online', 'offline', 'transaksi', 'kanal', 'channel']):
        hits.append('online_vs_offline')
    if any(w in t for w in ['hari dalam seminggu', 'per hari', 'day of week', 'senin', 'selasa', 'minggu']) and 'registrasi' in t:
        hits.append('dow_registrations')
    if any(w in t for w in ['promo', 'promosi', 'dampak promo']):
        hits.append('promo_impact')
    if any(w in t for w in ['prediksi', 'forecast', 'ramalan']):
        hits.append('forecast')
    return hits

def _pick_best_charts(df) -> list[str]:
    picks = ['enterpriser_trend', 'sales_trend']
    has_promo = df['is_promo_period'].sum() > 0
    online_col = 'transaction_volume_online' in df.columns
    if has_promo:
        picks.append('promo_impact')
    elif online_col:
        picks.append('online_vs_offline')
    else:
        picks.append('dow_registrations')
    return picks[:3]

def _generate_charts(chart_ids: list[str], df, days=90, forecast_days=7) -> str:
    html_parts = []
    catalog_map = {c[0]: c[3] for c in CHART_CATALOG}
    for cid in chart_ids:
        fn = catalog_map.get(cid)
        if fn:
            result = fn(df, days=days, forecast_days=forecast_days)
            if result:
                html_parts.append(result)
    return '\n\n'.join(html_parts)

def _build_suggestion_text() -> str:
    lines = ['<p>Berikut beberapa visualisasi yang bisa saya buatkan dari data yang tersedia:</p><ol>']
    for i, (_, label, desc, _) in enumerate(CHART_CATALOG, 1):
        lines.append(f'<li><strong>{label}</strong> -- {desc}</li>')
    lines.append('</ol>')
    lines.append('<p>Silakan pilih nomor visualisasi yang diinginkan (contoh: "1, 3, 5"), '
                 'atau jawab "<strong>apa saja</strong>" untuk saya buatkan yang paling relevan (maksimum 3).</p>')
    return '\n'.join(lines)


def _md_to_html(text: str) -> str:
    raw = re.sub(r'([^\n])(\n)([\*\-\+] |\d+[\.\)] )', r'\1\n\n\3', text)
    return markdown.markdown(raw)


def ask_hive_agent(question: str, api_key: str, model_name: str, history: list = None) -> str:
    df = load_and_clean_data()

    q_lower = question.lower()
    extracted_days = _extract_days(q_lower)
    has_time = _has_time_ref(q_lower)

    # --- Check if this is a follow-up chart selection (user picked numbers or "apa saja") ---
    pending_viz = False
    if history:
        for msg in reversed(history):
            if msg.role == "user":
                break
            if msg.role == "agent" and "pilih nomor visualisasi" in msg.content.lower():
                pending_viz = True
                break

    if pending_viz:
        selected = _is_chart_selection(q_lower)
        if _is_select_all(q_lower):
            best = _pick_best_charts(df)
            days = extracted_days or 90
            intro = '<p>Berikut 3 visualisasi yang paling relevan dari data yang ada:</p>'
            charts = _generate_charts(best, df, days=days)
            return intro + '\n\n' + charts
        elif selected:
            chart_ids = []
            for n in selected:
                if 1 <= n <= len(CHART_CATALOG):
                    chart_ids.append(CHART_CATALOG[n - 1][0])
            chart_ids = chart_ids[:3]
            if len(selected) > 3:
                intro = f'<p>Saya tampilkan 3 visualisasi terlebih dahulu (dari {len(selected)} yang dipilih). Minta lagi untuk sisanya.</p>'
            else:
                intro = ''
            days = extracted_days or 90
            charts = _generate_charts(chart_ids, df, days=days)
            return intro + charts if charts else '<p>Nomor yang dipilih tidak valid. Silakan pilih antara 1-6.</p>'

    # --- Generic viz request without specifics -> show suggestions ---
    if _is_viz_request(q_lower):
        specific = _detect_specific_viz(q_lower)
        if specific:
            days = extracted_days or 90
            charts = _generate_charts(specific[:3], df, days=days, forecast_days=extracted_days or 7)
            if len(specific) > 3:
                extra_text = f'<p>Ada {len(specific) - 3} visualisasi lagi yang bisa ditampilkan. Mau saya lanjutkan?</p>'
                charts += '\n\n' + extra_text
            return charts
        return _build_suggestion_text()

    # --- LLM-based response (requires API key) ---
    if not api_key:
        return "Please configure your Gemini API Key in the Admin Widget first."

    client = genai.Client(api_key=api_key)

    total_records = len(df)
    avg_enterprisers = df['new_enterpriser_count'].mean()
    start_date = df['date'].min()
    end_date = df['date'].max()
    stats = get_full_summary_stats()

    # --- Determine context ---
    inferred_context = None
    if history:
        for msg in reversed(history):
            if msg.role == "user":
                content = msg.content.lower()
                if "prediksi" in content or "forecast" in content:
                    inferred_context = "forecast"
                    break
                elif "tren" in content:
                    inferred_context = "trend"
                    break

    is_trend_context = "tren" in q_lower or inferred_context == "trend"
    is_forecast_context = any(w in q_lower for w in ['prediksi', 'forecast', 'ramalan']) or inferred_context == "forecast"

    trend_days = extracted_days if (extracted_days and is_trend_context) else 30
    df_trend = df.tail(trend_days)
    tren_ep_x_hari = df_trend[['date', 'sales_ep_thousand_idr']].to_string(index=False)

    forecast_days = extracted_days if (extracted_days and is_forecast_context) else 7

    forecast_values = []
    try:
        forecast = get_forecast(forecast_days)
        forecast_values = forecast['forecasted_new_enterprisers']
        forecast_str = str(forecast_values)
    except Exception as e:
        forecast_str = f"Forecast unavailable: {e}"

    system_instruction = f"""
    You are HIVE (HDI Intelligence & Value Engine), an AI assistant for HDI managers.
    You must ALWAYS answer in natural Bahasa Indonesia, sounding like a knowledgeable assistant briefing a manager.
    DO NOT use emotes or emojis.
    CRITICAL: DO NOT output raw data tables or python arrays. Instead, summarize key insights, highlight the highest/lowest points, dan sebutkan tanggalnya agar tidak ambigu.

    Current System Context:
    - Total Data Points: {total_records} days
    - Average Daily New Enterprisers: {avg_enterprisers:.2f}
    - Data ranges from {start_date} to {end_date}
    - Total Enterpriser baru 7 hari terakhir ({stats['week_start_date']} hingga {stats['week_end_date']}): {stats['new_enterprisers_this_week']}
    - Hari paling banyak registrasi Enterpriser: {stats['busiest_day_of_week']} (0=Senin, 6=Minggu)

    Tren EP penjualan {trend_days} hari terakhir (Gunakan data ini untuk analisis, JANGAN tampilkan tabelnya):
    {tren_ep_x_hari}

    Forecast jumlah Enterpriser baru untuk {forecast_days} hari ke depan (Gunakan data array ini untuk dianalisa dan dibuat ringkasan, JANGAN tampilkan array nya secara raw):
    {forecast_str}
    """

    contents = []
    if history:
        for msg in history:
            role = "user" if msg.role == "user" else "model"
            clean_content = re.sub(r'<div class="plotly.*?</div>', '', msg.content, flags=re.DOTALL).strip()
            if clean_content:
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=clean_content)]))

    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=question)]))

    response = client.models.generate_content(
        model=model_name,
        contents=contents,
        config=types.GenerateContentConfig(system_instruction=system_instruction)
    )

    answer_text = _md_to_html(response.text)

    if is_trend_context and has_time:
        answer_text += '\n\n' + _chart_sales_trend(df, days=trend_days)

    if is_forecast_context and has_time and forecast_values:
        answer_text += '\n\n' + _chart_forecast(df, forecast_days=forecast_days)

    return answer_text
