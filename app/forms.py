from flask_wtf import FlaskForm
from wtforms import StringField, SubmitField, IntegerField, BooleanField
from wtforms.validators import DataRequired, Optional, Length
from wtforms.widgets import Input

class ButtonField(BooleanField):
    widget = Input(input_type='button')

class video(FlaskForm):
    user = StringField("Username", validators=[DataRequired()])
    start_time_hour = StringField("Start hour", validators=[Length(min=2, max=2)])
    start_time_minute = StringField("Start minute", validators=[Length(min=2, max=2)])
    start_time_sec = StringField("Start second", validators=[Length(min=2, max=2)])
    end_time_hour = StringField("End hour", validators=[Length(min=2, max=2)])
    end_time_minute = StringField("End minute", validators=[Length(min=2, max=2)])
    end_time_sec = StringField("End second", validators=[Length(min=2, max=2)])
    check_stream_info_btn = ButtonField()
    submit = SubmitField("Create Video")
