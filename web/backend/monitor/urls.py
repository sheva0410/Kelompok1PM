from django.urls import path

from .views import ExportCSVView

urlpatterns = [
    path('api/export', ExportCSVView.as_view(), name='api_export'),
]
