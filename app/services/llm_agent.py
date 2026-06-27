import os
import io
import base64
import plotly.express as px
import plotly.graph_objects as go
import json
from google import genai
from google.genai import types
from app.services.data_pipeline import load_and_clean_data, get_full_summary_stats
from app.services.forecasting import get_forecast

def generate_sales_trend_plot(df_trend, days=30):
    fig = px.line(df_trend, x='date', y='sales_ep_thousand_idr', 
                  title=f'Tren Penjualan (EP) - {days} Hari Terakhir',
                  markers=True)
                  
    fig.update_layout(
        plot_bgcolor='#1a1a24',
        paper_bgcolor='#1a1a24',
        font_color='white',
        xaxis=dict(gridcolor='rgba(255,255,255,0.1)', title='Tanggal'),
        yaxis=dict(gridcolor='rgba(255,255,255,0.1)', title='Sales (ribu IDR)'),
        margin=dict(l=20, r=20, t=40, b=20)
    )
    
    fig.update_traces(line_color='#00d1b2')
    
    # Export to JSON
    chart_json = fig.to_json()
    b64_json = base64.b64encode(chart_json.encode('utf-8')).decode('utf-8')
    
    # Return a placeholder div that React will parse
    return f'<div class="plotly-chart-container" style="width:100%; height:400px; margin-top:10px;" data-bconfig="{b64_json}"></div>'

def generate_forecast_plot(forecast_values, end_date_str, days=7):
    import pandas as pd
    end_date = pd.to_datetime(end_date_str)
    future_dates = [end_date + pd.Timedelta(days=i) for i in range(1, len(forecast_values) + 1)]
    
    df_forecast = pd.DataFrame({
        'date': future_dates,
        'predicted_new_enterprisers': forecast_values
    })
    
    fig = px.line(df_forecast, x='date', y='predicted_new_enterprisers', 
                  title=f'Prediksi Enterpriser Baru ({days} Hari Ke Depan)',
                  markers=True)
                  
    fig.update_layout(
        plot_bgcolor='#1a1a24',
        paper_bgcolor='#1a1a24',
        font_color='white',
        xaxis=dict(gridcolor='rgba(255,255,255,0.1)', title='Tanggal'),
        yaxis=dict(gridcolor='rgba(255,255,255,0.1)', title='Prediksi Jumlah'),
        margin=dict(l=20, r=20, t=40, b=20)
    )
    
    fig.update_traces(line_color='#ff3860', line_dash='dash')
    
    chart_json = fig.to_json()
    b64_json = base64.b64encode(chart_json.encode('utf-8')).decode('utf-8')
    return f'<div class="plotly-chart-container" style="width:100%; height:400px; margin-top:10px;" data-bconfig="{b64_json}"></div>'

def ask_hive_agent(question: str, api_key: str, model_name: str, history: list = None) -> str:
    """Answers queries using data context and the Gemini LLM."""
    if not api_key:
        return "Error: GEMINI_API_KEY is not configured in the Admin settings."

    client = genai.Client(api_key=api_key)
    
    df = load_and_clean_data()
    total_records = len(df)
    avg_enterprisers = df['new_enterpriser_count'].mean()
    start_date = df['date'].min()
    end_date = df['date'].max()
    
    stats = get_full_summary_stats()
    
    import re
    q_lower = question.lower()
    
    # Determine context from history by scanning backwards
    inferred_context = None
    if history:
        for msg in reversed(history):
            if msg.role == "user":
                content = msg.content.lower()
                if "prediksi" in content:
                    inferred_context = "forecast"
                    break
                elif "tren" in content:
                    inferred_context = "trend"
                    break
                
    is_trend_context = "tren" in q_lower or inferred_context == "trend"
    is_forecast_context = "prediksi" in q_lower or inferred_context == "forecast"
    
    # Extract requested trend days, default to 30
    match_days = re.search(r'(\d+)\s*hari', q_lower)
    extracted_days = int(match_days.group(1)) if match_days else None
    
    trend_days = extracted_days if (extracted_days and is_trend_context) else 30
    df_trend = df.tail(trend_days)
    tren_ep_x_hari = df_trend[['date', 'sales_ep_thousand_idr']].to_string(index=False)
    
    # Extract requested forecast days, default to 7
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
            # Strip HTML to not confuse Gemini
            clean_content = re.sub(r'<div class="plotly.*?</div>', '', msg.content, flags=re.DOTALL).strip()
            if clean_content:
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=clean_content)]))
                
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=question)]))
    
    response = client.models.generate_content(
        model=model_name,
        contents=contents,
        config=types.GenerateContentConfig(system_instruction=system_instruction)
    )
    
    import markdown
    answer_text = markdown.markdown(response.text)
    
    q_lower = question.lower()
    
    # Visualization: dynamic historical trend
    if is_trend_context and "hari" in q_lower:
        plot_html = generate_sales_trend_plot(df_trend, trend_days)
        answer_text += f"\n\n{plot_html}"
        
    # Visualization: dynamic forecast
    if is_forecast_context and "hari" in q_lower and forecast_values:
        plot_html = generate_forecast_plot(forecast_values, end_date, forecast_days)
        answer_text += f"\n\n{plot_html}"
        
    return answer_text
