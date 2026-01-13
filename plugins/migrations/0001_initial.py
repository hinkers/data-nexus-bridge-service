# Generated manually for plugin system

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('affinda_bridge', '0004_synchistory'),
    ]

    operations = [
        migrations.CreateModel(
            name='Plugin',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.CharField(help_text="Unique identifier for the plugin (e.g., 'my-company.email-importer')", max_length=128, unique=True)),
                ('name', models.CharField(help_text='Display name of the plugin', max_length=255)),
                ('author', models.CharField(blank=True, max_length=255)),
                ('version', models.CharField(help_text="Semantic version (e.g., '1.0.0')", max_length=32)),
                ('description', models.TextField(blank=True)),
                ('python_path', models.CharField(help_text="Python module path to the plugin class (e.g., 'my_plugin.MyPlugin')", max_length=512)),
                ('enabled', models.BooleanField(default=True)),
                ('installed_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('config_schema', models.JSONField(blank=True, default=dict, help_text="JSON Schema defining the plugin's global configuration options")),
                ('config', models.JSONField(blank=True, default=dict, help_text='Plugin-level configuration values')),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='PluginComponent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('component_type', models.CharField(choices=[('importer', 'Importer'), ('preprocessor', 'Pre-Processor'), ('postprocessor', 'Post-Processor')], max_length=32)),
                ('slug', models.CharField(help_text='Component identifier within the plugin', max_length=128)),
                ('name', models.CharField(help_text='Display name', max_length=255)),
                ('description', models.TextField(blank=True)),
                ('python_path', models.CharField(help_text="Python class path (e.g., 'my_plugin.importers.EmailImporter')", max_length=512)),
                ('config_schema', models.JSONField(blank=True, default=dict, help_text='JSON Schema defining configuration options for instances')),
                ('plugin', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='components', to='plugins.plugin')),
            ],
            options={
                'ordering': ['plugin', 'component_type', 'name'],
            },
        ),
        migrations.CreateModel(
            name='PluginInstance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(help_text='User-defined name for this instance', max_length=255)),
                ('enabled', models.BooleanField(default=True)),
                ('priority', models.IntegerField(default=100, help_text='Execution order (lower = earlier). Used for pre/post-processors.')),
                ('config', models.JSONField(blank=True, default=dict, help_text='Instance-specific configuration values')),
                ('event_triggers', models.JSONField(blank=True, default=list, help_text='List of event types that trigger this post-processor')),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('collections', models.ManyToManyField(blank=True, help_text='Limit this instance to specific collections (empty = all collections)', related_name='plugin_instances', to='affinda_bridge.collection')),
                ('component', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='instances', to='plugins.plugincomponent')),
            ],
            options={
                'ordering': ['priority', 'name'],
            },
        ),
        migrations.CreateModel(
            name='PluginExecutionLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('started', 'Started'), ('success', 'Success'), ('failed', 'Failed')], default='started', max_length=32)),
                ('event_type', models.CharField(blank=True, help_text='Event that triggered this execution', max_length=64)),
                ('started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('input_data', models.JSONField(blank=True, default=dict)),
                ('output_data', models.JSONField(blank=True, default=dict)),
                ('error_message', models.TextField(blank=True)),
                ('document', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='plugin_execution_logs', to='affinda_bridge.document')),
                ('instance', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='execution_logs', to='plugins.plugininstance')),
            ],
            options={
                'ordering': ['-started_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='plugincomponent',
            constraint=models.UniqueConstraint(fields=('plugin', 'slug'), name='unique_plugin_component_slug'),
        ),
        migrations.AddIndex(
            model_name='pluginexecutionlog',
            index=models.Index(fields=['instance', '-started_at'], name='plugins_plu_instanc_c8f9b1_idx'),
        ),
        migrations.AddIndex(
            model_name='pluginexecutionlog',
            index=models.Index(fields=['document', '-started_at'], name='plugins_plu_documen_e7b1a2_idx'),
        ),
        migrations.AddIndex(
            model_name='pluginexecutionlog',
            index=models.Index(fields=['status'], name='plugins_plu_status_a3d4e5_idx'),
        ),
    ]
