from fastapi import FastAPI
from pydantic import BaseModel
import re

app = FastAPI(title="MKU Social Risk AI")

# ===================================
# INPUT
# ===================================

class Post(BaseModel):
    content: str
    comments: str = ""


# ===================================
# TIỀN XỬ LÝ
# ===================================

def clean_text(text):
    text=text.lower()

    text=re.sub(
        r"http\S+",
        "",
        text
    )

    text=re.sub(
        r"[^\w\sàáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]",
        " ",
        text
    )

    return text


# ===================================
# 1. TỪ KHÓA TIÊU CỰC + ĐIỂM
# ===================================

negative_keywords={

# cảm xúc
"bức xúc":40,
"phàn nàn":25,
"không hài lòng":15,
"tệ":25,
"kém":25,

# học thuật
"chất lượng kém":50,
"giảng dạy kém":35,
"điểm thấp":15,
"thiếu hướng dẫn":25,

# tài chính
"học phí cao":30,
"quản lý yếu kém":45,

# nghiêm trọng
"lừa đảo":85,
"scam":85,
"tham nhũng":95,

# cơ sở vật chất
"xuống cấp":30,
"hư hỏng":15,
"nóng":10
}


# ===================================
# 2. TIẾNG LÓNG / MỈA MAI
# ===================================

slang_words={

"toang":40,
"sml":45,
"vcl":50,
"hãm":45,
"rác":45,
"loz":40

}

sarcasm_phrases=[
"ổn dữ chưa",
"hay ghê ha",
"quá tuyệt vời",
"đúng là đẳng cấp"
]


# ===================================
# 3. GÁN CHỦ ĐỀ + LĨNH VỰC
# ===================================

topics={

"Học phí / Chi phí":[
"học phí",
"tiền học",
"học quân sự",
"bao nhiêu tiền"
],

"Cơ sở vật chất":[
"phòng học",
"máy lạnh",
"ký túc",
"hư",
"nóng"
],

"Giảng viên / Học tập":[
"giảng viên",
"thầy cô",
"điểm",
"môn học"
],

"Hỏi đáp sinh viên":[
"ai biết",
"cho hỏi",
"ở đâu",
"bao nhiêu tiền"
],

"Đời sống sinh viên":[
"căn tin",
"xe bus",
"ở trọ",
"nhờ giúp"
]

}


field_map={

"Học phí / Chi phí":"Tài chính",
"Cơ sở vật chất":"Cơ sở vật chất",
"Giảng viên / Học tập":"Đào tạo",
"Hỏi đáp sinh viên":"Đời sống sinh viên",
"Đời sống sinh viên":"Đời sống sinh viên"

}


# ===================================
# PHÂN LOẠI BÀI VIẾT
# ===================================

def classify_post(text):

    if "?" in text or "cho hỏi" in text:
        return "Hỏi thông tin"

    if "bán" in text or "pass" in text:
        return "Rao vặt"

    if "bức xúc" in text:
        return "Phản ánh"

    return "Chia sẻ"


# ===================================
# GÁN CHỦ ĐỀ
# ===================================

def detect_topics(text):

    found=[]

    for topic,keys in topics.items():

        for k in keys:
            if k in text:
                found.append(topic)
                break

    if not found:
        found=["Khác"]

    return found


# ===================================
# PHÂN TÍCH CHÍNH
# ===================================

def analyze(content,comments):

    raw=content+" "+comments

    text=clean_text(raw)

    score=0

    found_keywords=[]

    slang_flag=False


    # tính điểm từ khóa
    for k,v in negative_keywords.items():

        if k in text:
            score+=v
            found_keywords.append(k)


    # tiếng lóng
    for k,v in slang_words.items():

        if k in text:
            score+=v
            slang_flag=True
            found_keywords.append(k)


    # mỉa mai
    for s in sarcasm_phrases:

        if s in text:
            score+=30
            slang_flag=True
            found_keywords.append(s)


    score=min(score,100)


    # không có từ khóa -> tự suy luận nhẹ
    if score==0:
        score=3


    # sentiment
    if score>=70:
        label="Tiêu cực mạnh"
        risk="Cao"

    elif score>=50:
        label="Tiêu cực"
        risk="Trung bình"

    else:
        label="Bình thường"
        risk="Thấp"


    topics_detected=detect_topics(raw)

    field=field_map.get(
        topics_detected[0],
        "Khác"
    )


    return {

        "LoaiBaiViet":
            classify_post(raw),

        "ChuDe":
            topics_detected,

        "LinhVuc":
            field,

        "CoTiengLong_MiaMai":
            slang_flag,

        "PhanTramTieuCuc":
            score,

        "DanhGia":
            label,

        "TuKhoaPhatHien":
            found_keywords,

        "MucDoRuiRo":
            risk,

        "DeXuatXuLy":
            (
                "Cảnh báo khẩn"
                if risk=="Cao"
                else
                "Theo dõi"
                if risk=="Trung bình"
                else
                "Không cần xử lý"
            )

    }


# ===================================
# API
# ===================================

@app.post("/analyze")
def analyze_post(post:Post):

    return analyze(
        post.content,
        post.comments
    )