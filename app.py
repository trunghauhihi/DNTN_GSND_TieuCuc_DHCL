from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import re
from typing import List, Dict, Any, Union

app = FastAPI(title="GSNDTC MKU")

# ==========================================
# 1. INPUT (giữ nguyên cấu trúc n8n)
# ==========================================
class PostData(BaseModel):
    TacGia: str = ""
    NoiDung: str
    URLBaiViet: str = ""
    BinhLuan: Union[str, List[str]] = []
    TongSoBinhLuan: int = 0

# ==========================================
# 2. TIỀN XỬ LÝ (giữ dấu câu để tránh vỡ từ)
# ==========================================
def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r'http\S+', '', text)                 # xoá URL
    # Giữ lại chữ, số, khoảng trắng, và một số dấu câu cơ bản
    text = re.sub(r'[^\w\sàáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]', ' ', text)
    return text

# ==========================================
# 3. BỘ TỪ KHÓA (dùng regex với boundary để tránh false positive)
# ==========================================
# ==========================================
# 3. BỘ TỪ KHÓA ĐẦY ĐỦ (chuẩn hóa từ bảng 111)
# ==========================================

negative_keywords = {
    # --- Cảm xúc ---
    r"\bbức xúc\b": 40, r"\bphàn nàn\b": 25, r"\bkhông hài lòng\b": 15,
    r"\btệ\b": 25, r"\bkém\b": 25, r"\bbị chê\b": 15,
    r"\bmất niềm tin\b": 60, r"\btẩy chay\b": 50,
    r"\bmất đoàn kết\b": 25, r"\bthất vọng\b": 20,
    r"\bức chế\b": 35, r"\bbất mãn\b": 30,

    # --- Đào tạo ---
    r"\bchất lượng kém\b": 50, r"\bkhông đạt chuẩn\b": 55,
    r"\bgiảng dạy kém\b": 30, r"\bđiểm thấp\b": 15,
    r"\bbằng cấp thấp\b": 70, r"\bthiếu sáng tạo\b": 25,
    r"\bthiếu động lực\b": 25, r"\bthiếu hướng dẫn\b": 25,
    r"\btuyển sinh ảo\b": 50, r"\bdạy dở\b": 30,
    r"\bchương trình nặng\b": 20, r"\bhọc tủ\b": 25,
    r"\bđề thi sai\b": 40, r"\bthiếu thực hành\b": 20,

    # --- Quản trị ---
    r"\bquản lý yếu kém\b": 45, r"\bthiếu minh bạch\b": 50,
    r"\bsai quy trình\b": 25, r"\bsai phạm\b": 45,
    r"\bvi phạm\b": 50, r"\bhọc phí cao\b": 25,
    r"\bnợ lương\b": 75, r"\bvô trách nhiệm\b": 30,
    r"\bbỏ bê\b": 25, r"\bkhông chuyên nghiệp\b": 25,
    r"\bthiếu giáo viên\b": 25, r"\bquan liêu\b": 40,
    r"\bhành chính chậm\b": 25,

    # --- Khủng hoảng ---
    r"\bmất uy tín\b": 70, r"\btin xấu\b": 30,
    r"\bxuống cấp\b": 30, r"\bđình bản\b": 90,
    r"\bđóng cửa\b": 100, r"\bsụp đổ\b": 100,

    # --- Thông tin ---
    r"\btin đồn\b": 15, r"\bsai lệch thông tin\b": 25,
    r"\bphản ánh\b": 10,

    # --- CSVC ---
    r"\bmất vệ sinh\b": 15, r"\bchậm tiến độ\b": 25,
    r"\bhư hỏng\b": 15, r"\bnóng\b": 10,
    r"\bồn ào\b": 10, r"\bchật chội\b": 15,
    r"\btắc đường\b": 10,
}

# Tiếng lóng – dùng boundary để chỉ bắt khi là từ độc lập
slang_words = {
    r"\b(dm+|đm+)\b": 85,
    r"\b(dkm+|đkm+)\b": 80,
    r"\b(dcm+|đcm+)\b": 80,
    r"\b(clm+)\b": 75,
    r"\b(cm+n)\b": 70,

    r"\b(vl|vcl|vkl|vcc)\b": 65,
    r"\b(vãi|vai)\b": 60,

    r"\b(cc|cak|kak)\b": 60,

    r"\b(loz|lz|l0n|lon)\b": 55,
    r"\b(sml)\b": 55,

    r"\b(ngu)\b": 70,
    r"\b(óc chó|oc cho)\b": 60,

    r"\b(rac|rác)\b": 55,
    r"\b(sida)\b": 45,
    r"\b(lol)\b": 30,
}

sarcasm_phrases = [
    "đỉnh cao", "dinh cao",
    "quá tuyệt vời", "qua tuyet voi",
    "hay ghê", "hay ghe",
    "ổn dữ chưa", "on du chua",
    "best",
    "10 điểm", "10d",
    "tuyệt vời ông mặt trời",
    "siêu chất",
    "xin vía",
    "ảo tưởng",
    "đúng là người lớn",
    "dạy giỏi quá",
    "trình độ cao siêu"
]

# ==========================================
# 4. NHẬN DIỆN CHỦ ĐỀ ƯU TIÊN (dựa trên nội dung thực tế)
# ==========================================
def detect_chude(text: str) -> List[str]:
    text = text.lower()
    # Ưu tiên các chủ đề đặc biệt
    if re.search(r"\bt(ìm|hỏi).{0,10}trọ\b", text) or re.search(r"\bcần trọ\b", text):
        return ["Nhà trọ / Ký túc xá"]
    if re.search(r"\bhỏi\b|\bcho hỏi\b|\?$", text):
        return ["Hỏi thông tin"]
    if re.search(r"\bbán\b|\bpass\b|\bthanh lý\b|\bgiá\b", text):
        return ["Rao vặt"]

    # Các chủ đề theo từ khóa học thuật
    topic_keywords = {
        "Đào tạo": ["đào tạo", "chương trình", "giảng dạy", "thi", "điểm", "bằng cấp", "học phần"],
        "Tuyển sinh": ["tuyển sinh", "xét tuyển", "hồ sơ", "nguyện vọng"],
        "Quản lý": ["quản lý", "hành chính", "thủ tục", "phòng đào tạo"],
        "Cơ sở vật chất": ["phòng học", "máy lạnh", "ký túc", "thư viện", "hỏng", "nóng", "vệ sinh"],
        "Hoạt động sinh viên": ["clb", "hoạt động", "sự kiện", "phong trào"],
    }
    for topic, kws in topic_keywords.items():
        if any(kw in text for kw in kws):
            return [topic]
    return ["Đời sống sinh viên"]

# ==========================================
# 5. PHÂN TÍCH CHÍNH (có thêm suy luận bài tìm trọ)
# ==========================================
def analyze_post(tacgia: str, noidung: str, binhluan: str, tong_binhluan: int, url: str) -> Dict[str, Any]:
    raw_text = noidung + " " + binhluan
    clean = clean_text(raw_text)

    # --- Điểm mặc định: rất thấp (không tiêu cực) ---
    score = 0
    slang_flag = False

    # --- Nếu bài viết tìm trọ / hỏi thông tin thông thường → thoát sớm, điểm cực thấp ---
    if re.search(r"\bt(ìm|hỏi).{0,10}trọ\b", noidung.lower()) or re.search(r"\bcần trọ\b", noidung.lower()):
        score = 3
        chude_list = detect_chude(noidung)
        return {
            "TacGia": tacgia,
            "NoiDung": noidung,
            "URL": url or "",
            "BinhLuan": binhluan,
            "TongSoBinhLuan": tong_binhluan,
            "ChuDe": chude_list,
            "CoTiengLong_MiaMai": False,
            "PhanTramTieuCuc": 3,
            "DanhGia": "Trung tính / Bình thường",
            "MucDoRuiRo": "Thấp",
            "DeXuatXuLy": "Không cần xử lý",
        }

    # --- Tính điểm từ khóa (dùng regex với word boundary) ---
    for pattern, point in negative_keywords.items():
        if re.search(pattern, clean):
            score += point

    # --- Tiếng lóng / mỉa mai ---
    for pattern, point in slang_words.items():
        if re.search(pattern, clean):
            score += point
            slang_flag = True

    for phrase in sarcasm_phrases:
        if phrase in clean:
            score += 30
            slang_flag = True

    # --- Bình luận (cộng thêm nếu có nhiều bình luận) ---
    if tong_binhluan >= 5:
        score += 15
    elif tong_binhluan >= 3:
        score += 10

    score = min(max(score, 0), 100)
    if score == 0:
        score = 3

    # --- Đánh giá mức độ ---
    if score >= 70:
        danhgia = "Tiêu cực mạnh"
        ruicro = "Rất Cao"
    elif score >= 50:
        danhgia = "Tiêu cực"
        ruicro = "Cao"
    elif score >= 20:
        danhgia = "Trung tính / Bình thường"
        ruicro = "Trung bình"
    else:
        danhgia = "Trung tính / Bình thường"
        ruicro = "Thấp"

    chude_list = detect_chude(noidung)

    if ruicro in ["Cao", "Trung bình - Cao"]:
        dexuat = "Cần xử lý ngay, báo cáo lãnh đạo"
    elif ruicro == "Trung bình":
        dexuat = "Theo dõi nhẹ, có thể phản hồi"
    else:
        dexuat = "Không cần xử lý"

    return {
        "TacGia": tacgia,
        "NoiDung": noidung,
        "URL": url or "",
        "BinhLuan": binhluan,
        "TongSoBinhLuan": tong_binhluan,
        "ChuDe": chude_list,
        "CoTiengLong_MiaMai": slang_flag,
        "PhanTramTieuCuc": score,
        "DanhGia": danhgia,
        "MucDoRuiRo": ruicro,
        "DeXuatXuLy": dexuat,
    }

# ==========================================
# 6. API ENDPOINT
# ==========================================
@app.post("/analyze")
def analyze_endpoint(post: PostData):
    # Convert BinhLuan to string if it's a list
    binhluan_str = post.BinhLuan if isinstance(post.BinhLuan, str) else " ".join(post.BinhLuan)
    return analyze_post(
        tacgia=post.TacGia,
        noidung=post.NoiDung,
        binhluan=binhluan_str,
        tong_binhluan=post.TongSoBinhLuan,
        url=post.URLBaiViet
    )

# ==========================================
# 7. RUN (python app.py)
# ==========================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)