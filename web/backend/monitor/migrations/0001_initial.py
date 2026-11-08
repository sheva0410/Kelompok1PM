import django.contrib.auth.models
import django.contrib.auth.validators
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='Node',
            fields=[
                ('node_id', models.CharField(max_length=4, primary_key=True, serialize=False)),
                ('nama', models.CharField(max_length=100)),
                ('lokasi', models.CharField(blank=True, max_length=200)),
                ('pos_x', models.FloatField(default=0)),
                ('pos_y', models.FloatField(default=0)),
                ('aktif', models.BooleanField(default=True)),
            ],
        ),
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('username', models.CharField(error_messages={'unique': 'A user with that username already exists.'}, help_text='Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.', max_length=150, unique=True, validators=[django.contrib.auth.validators.UnicodeUsernameValidator()], verbose_name='username')),
                ('first_name', models.CharField(blank=True, max_length=150, verbose_name='first name')),
                ('last_name', models.CharField(blank=True, max_length=150, verbose_name='last name')),
                ('is_staff', models.BooleanField(default=False, help_text='Designates whether the user can log into this admin site.', verbose_name='staff status')),
                ('is_active', models.BooleanField(default=True, help_text='Designates whether this user should be treated as active. Unselect this instead of deleting accounts.', verbose_name='active')),
                ('date_joined', models.DateTimeField(default=django.utils.timezone.now, verbose_name='date joined')),
                ('role', models.CharField(choices=[('warga', 'Warga'), ('pengelola', 'Pengelola'), ('admin', 'Admin')], default='warga', max_length=20)),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'verbose_name': 'user',
                'verbose_name_plural': 'users',
                'abstract': False,
            },
            managers=[
                ('objects', django.contrib.auth.models.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='Report',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tingkat_dirasakan', models.IntegerField(choices=[(0, 'Rendah'), (1, 'Sedang'), (2, 'Tinggi')])),
                ('description', models.TextField()),
                ('image', models.ImageField(blank=True, null=True, upload_to='laporan_img/')),
                ('status', models.CharField(choices=[('baru', 'Baru'), ('diproses', 'Diproses'), ('selesai', 'Selesai')], default='baru', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('handled_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='handled_reports', to=settings.AUTH_USER_MODEL)),
                ('node', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reports', to='monitor.node')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reports', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Reading',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('seq', models.PositiveIntegerField()),
                ('waktu', models.DateTimeField()),
                ('mq2', models.FloatField()),
                ('mq3', models.FloatField()),
                ('mq4', models.FloatField()),
                ('mq5', models.FloatField()),
                ('mq6', models.FloatField()),
                ('mq8', models.FloatField()),
                ('mq9', models.FloatField()),
                ('mq135', models.FloatField()),
                ('mq136', models.FloatField()),
                ('suhu', models.FloatField(blank=True, null=True)),
                ('kelembapan', models.FloatField(blank=True, null=True)),
                ('level', models.IntegerField(blank=True, choices=[(0, 'Rendah'), (1, 'Sedang'), (2, 'Tinggi')], null=True)),
                ('model_ver', models.CharField(blank=True, max_length=20)),
                ('node', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='readings', to='monitor.node')),
            ],
            options={
                'ordering': ['-waktu'],
                'indexes': [models.Index(fields=['node', 'waktu'], name='monitor_rea_node_id_51cac3_idx')],
                'constraints': [models.UniqueConstraint(fields=('node', 'seq'), name='uniq_reading_node_seq')],
            },
        ),
    ]
